import 'dart:async';

import 'package:flutter/material.dart';

import '../api/client.dart';
import '../app.dart';
import '../chat.dart';
import '../models.dart';
import '../theme.dart';

/// Pesan di layar (bukan baris DB). Placeholder asisten punya done=false sampai job selesai.
class _Msg {
  _Msg({required this.id, required this.role, this.text = '', this.done = true});
  final int id;
  final String role;
  String text;
  List<String> steps = const [];
  bool done;
  String? error;
  String? code;
}

/// Tab Asisten: percakapan dengan agent yang membaca data riset org. Port halaman /chat web:
/// sid dari server, progres lewat polling /chat/poll, riwayat sesi, saran pertanyaan, kuota.
class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _input = TextEditingController();
  final _scroll = ScrollController();
  final List<_Msg> _msgs = [];
  List<ChatSession> _sessions = [];
  List<String> _suggestions = chatChips;
  String _sid = '';
  bool _ready = false;
  String? _disabled;
  String? _initError;
  bool _noKey = false;
  Object? _runningJob;
  int? _runningBotId;
  int _seq = 0;
  ({int used, int limit})? _quota;
  Timer? _pollTimer;
  int _pollDelayMs = 1200;
  int _pollFails = 0;

  @override
  void initState() {
    super.initState();
    _init();
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  ApiClient get _api => ApiScope.of(context);
  bool get _running => _runningJob != null;

  Future<void> _init() async {
    setState(() {
      _initError = null;
      _disabled = null;
    });
    try {
      final sessions = await _api.chatSessions();
      if (!mounted) return;
      _sessions = sessions;
      if (sessions.isNotEmpty) {
        await _loadMessages(sessions.first.id);
      } else {
        _sid = await _api.chatSid();
      }
      if (!mounted) return;
      setState(() => _ready = true);
      _loadSuggestions();
      _loadQuota();
    } catch (e) {
      if (!mounted) return;
      final d = describeChatError(e);
      setState(() => d.code == 'disabled' ? _disabled = d.error : _initError = d.error);
    }
  }

  Future<void> _loadMessages(String sid) async {
    final h = await _api.chatMessages(sid);
    if (!mounted) return;
    setState(() {
      _sid = sid;
      _msgs
        ..clear()
        ..addAll(h.messages.map((r) => _Msg(id: ++_seq, role: r.role == 'user' ? 'user' : 'assistant', text: r.content)));
    });
    // job sesi ini yang masih jalan (mis. app dibuka ulang): lanjutkan mengikuti
    final job = h.activeJob;
    if (job != null && !_running) {
      final bot = _Msg(id: ++_seq, role: 'assistant', done: false);
      setState(() => _msgs.add(bot));
      try {
        final p = await _api.chatPoll(job);
        if (!mounted) return;
        if (!p.done) {
          _start(job, bot.id);
        } else if (p.answer.isNotEmpty || p.error.isNotEmpty) {
          _applyPoll(bot.id, p);
        } else {
          setState(() => _msgs.removeWhere((m) => m.id == bot.id));
        }
      } catch (_) {
        if (mounted) setState(() => _msgs.removeWhere((m) => m.id == bot.id));
      }
    }
    _scrollDown();
  }

  Future<void> _loadSuggestions() async {
    try {
      final list = await _api.chatSuggestions('chat');
      if (mounted && list.isNotEmpty) setState(() => _suggestions = list.take(4).toList());
    } catch (_) {}
  }

  Future<void> _loadQuota() async {
    try {
      final org = await _api.org();
      final limit = org.limits.chats;
      if (mounted && limit != null) setState(() => _quota = (used: org.usage['chat'] ?? 0, limit: limit));
    } catch (_) {}
  }

  void _patch(int id, void Function(_Msg m) f) {
    final m = _msgs.where((m) => m.id == id).firstOrNull;
    if (m == null) return;
    setState(() => f(m));
  }

  void _applyPoll(int botId, ChatPoll p) {
    final err = p.done && p.error.isNotEmpty ? p.error : '';
    final nk = err.isNotEmpty && isNoKey(err);
    if (nk) _noKey = true;
    _patch(botId, (m) {
      if (p.steps.isNotEmpty) m.steps = p.steps;
      m.done = p.done;
      if (p.answer.isNotEmpty) m.text = p.answer;
      if (err.isNotEmpty) {
        m.error = nk ? noKeyMsg : err;
        m.code = nk ? 'nokey' : 'other';
      } else if (p.done && p.answer.isEmpty && m.text.isEmpty) {
        m.error = 'Tidak ada jawaban dari asisten.';
      }
    });
    _scrollDown();
  }

  /// Setelah job berakhir: lepas polling, segarkan sesi, kuota, dan saran.
  void _finish() {
    _pollTimer?.cancel();
    setState(() {
      _runningJob = null;
      _runningBotId = null;
    });
    _api.chatSessions().then((s) => mounted ? setState(() => _sessions = s) : null).catchError((_) => null);
    _loadQuota();
    _loadSuggestions();
  }

  void _start(Object job, int botId) {
    _pollTimer?.cancel();
    setState(() {
      _runningJob = job;
      _runningBotId = botId;
    });
    _pollDelayMs = 1200;
    _pollFails = 0;
    _poll();
  }

  Future<void> _poll() async {
    final job = _runningJob;
    final botId = _runningBotId;
    if (job == null || botId == null) return;
    try {
      final p = await _api.chatPoll(job);
      if (!mounted || _runningJob != job) return;
      _pollFails = 0;
      _pollDelayMs = 1200;
      _applyPoll(botId, p);
      if (p.done) {
        _finish();
        return;
      }
    } catch (e) {
      if (!mounted || _runningJob != job) return;
      _pollFails++;
      _pollDelayMs = (_pollDelayMs * 2).clamp(1200, 15000);
      if (_pollFails >= 5 || (e is ApiException && (e.status == 401 || e.status == 404))) {
        final d = describeChatError(e);
        _patch(botId, (m) {
          m.done = true;
          m.error = d.error;
          m.code = d.code;
        });
        _finish();
        return;
      }
    }
    _pollTimer = Timer(Duration(milliseconds: _pollDelayMs), _poll);
  }

  Future<void> _ask(String text) async {
    text = text.trim();
    if (text.isEmpty || _running || _sid.isEmpty) return;
    _input.clear();
    final me = _Msg(id: ++_seq, role: 'user', text: text);
    final bot = _Msg(id: ++_seq, role: 'assistant', done: false);
    setState(() {
      _msgs.addAll([me, bot]);
      _runningJob = ''; // menunggu id job dari server; mencegah kirim ganda
      _runningBotId = bot.id;
    });
    _scrollDown();
    try {
      final r = await _api.chatSend(_sid, text, context: const {'page': 'chat'});
      if (!mounted) return;
      _sid = r.sid;
      _start(r.job, bot.id);
    } catch (e) {
      if (!mounted) return;
      final d = describeChatError(e);
      if (d.code == 'nokey') _noKey = true;
      if (d.code == 'disabled') _disabled = d.error;
      setState(() {
        _runningJob = null;
        _runningBotId = null;
      });
      _patch(bot.id, (m) {
        m.done = true;
        m.error = d.error;
        m.code = d.code;
      });
    }
  }

  Future<void> _stop() async {
    final job = _runningJob;
    _pollTimer?.cancel();
    setState(() {
      for (final m in _msgs) {
        if (m.role == 'assistant' && !m.done) {
          m.done = true;
          if (m.text.isEmpty) m.error = 'Dihentikan.';
        }
      }
      _runningJob = null;
      _runningBotId = null;
    });
    if (job != null && job != '') {
      try {
        await _api.chatStop(job);
      } catch (_) {}
    }
  }

  Future<void> _newChat() async {
    if (_running) await _stop();
    try {
      _sid = await _api.chatSid();
      if (!mounted) return;
      setState(() => _msgs.clear());
      _loadSuggestions();
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message);
    }
  }

  Future<void> _openSession(String id) async {
    if (id.isEmpty || id == _sid) return;
    if (_running) await _stop();
    try {
      await _loadMessages(id);
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message);
    }
  }

  Future<void> _deleteSession(String id) async {
    try {
      await _api.chatDeleteSession(id);
      if (!mounted) return;
      setState(() => _sessions.removeWhere((s) => s.id == id));
      if (id == _sid) {
        if (_running) await _stop();
        setState(() => _msgs.clear());
        _sid = await _api.chatSid();
      }
    } on ApiException catch (e) {
      if (mounted) toast(context, e.message);
    }
  }

  void _scrollDown() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) _scroll.animateTo(_scroll.position.maxScrollExtent, duration: const Duration(milliseconds: 200), curve: Curves.easeOut);
    });
  }

  void _history() {
    showModalBottomSheet<void>(
      context: context,
      builder: (sheet) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          padding: const EdgeInsets.all(12),
          children: [
            const Padding(padding: EdgeInsets.only(bottom: 8), child: Label('Riwayat percakapan')),
            if (_sessions.isEmpty) const Padding(padding: EdgeInsets.all(8), child: Text('Belum ada percakapan.')),
            ..._sessions.map((s) => ListTile(
                  dense: true,
                  title: Text(s.title.isEmpty ? '(tanpa judul)' : s.title, maxLines: 1, overflow: TextOverflow.ellipsis),
                  subtitle: Text(_fmtWhen(s.lastMessageAt ?? s.createdAt), style: Theme.of(context).textTheme.bodySmall),
                  selected: s.id == _sid,
                  selectedTileColor: RaqioColors.sunk,
                  trailing: IconButton(
                    icon: const Icon(Icons.delete_outline, size: 18, color: RaqioColors.faint),
                    tooltip: 'Hapus percakapan',
                    onPressed: () {
                      Navigator.of(sheet).pop();
                      _deleteSession(s.id);
                    },
                  ),
                  onTap: () {
                    Navigator.of(sheet).pop();
                    _openSession(s.id);
                  },
                )),
          ],
        ),
      ),
    );
  }

  static String _fmtWhen(String iso) {
    final d = DateTime.tryParse(iso)?.toLocal();
    if (d == null) return '';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    return '${d.day} ${months[d.month - 1]} ${d.year}, ${d.hour.toString().padLeft(2, '0')}.${d.minute.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Asisten'),
        actions: [
          IconButton(icon: const Icon(Icons.history, size: 20), tooltip: 'Riwayat', onPressed: _history),
          IconButton(icon: const Icon(Icons.add, size: 20), tooltip: 'Percakapan baru', onPressed: _ready ? _newChat : null),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: _msgs.isEmpty
                ? _Hero(
                    ready: _ready,
                    noKey: _noKey,
                    disabled: _disabled,
                    error: _initError,
                    suggestions: _suggestions,
                    onRetry: _init,
                    onPick: _ask,
                  )
                : ListView.builder(
                    controller: _scroll,
                    padding: const EdgeInsets.all(16),
                    itemCount: _msgs.length,
                    itemBuilder: (context, i) => _Bubble(m: _msgs[i]),
                  ),
          ),
          if (_quota != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Align(alignment: Alignment.centerLeft, child: Text(quotaText(_quota), style: t.labelSmall)),
            ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _input,
                      enabled: _ready && _disabled == null,
                      minLines: 1,
                      maxLines: 4,
                      textInputAction: TextInputAction.send,
                      decoration: const InputDecoration(hintText: 'Tanya soal pasar, pesaing, atau prospekmu…', isDense: true),
                      onSubmitted: _ask,
                    ),
                  ),
                  const SizedBox(width: 8),
                  _running
                      ? OutlinedButton(onPressed: _stop, child: const Text('STOP'))
                      : FilledButton(
                          onPressed: _ready && _disabled == null ? () => _ask(_input.text) : null,
                          child: const Icon(Icons.arrow_upward, size: 18),
                        ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Tampilan awal saat percakapan kosong, port ChatHero web.
class _Hero extends StatelessWidget {
  const _Hero({required this.ready, required this.noKey, required this.disabled, required this.error, required this.suggestions, required this.onRetry, required this.onPick});
  final bool ready;
  final bool noKey;
  final String? disabled;
  final String? error;
  final List<String> suggestions;
  final VoidCallback onRetry;
  final void Function(String) onPick;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const SizedBox(height: 18),
        Text('Kenali pasarmu.', style: t.headlineMedium),
        Text('Temukan celahnya.', style: t.headlineMedium?.copyWith(color: RaqioColors.faint)),
        const SizedBox(height: 10),
        Text(
          'Tanya bebas soal bisnis apa pun di lokasi mana pun. Agent akan mencari pemainnya, mengecek IG, website, dan tren, lalu merangkum siapa yang kuat, siapa yang lemah, dan di mana peluangnya.',
          style: t.bodySmall,
        ),
        const SizedBox(height: 14),
        if (disabled != null) Panel(child: Text('Asisten tidak aktif. $disabled', style: t.bodySmall)),
        if (error != null)
          Panel(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Asisten belum bisa dibuka. $error', style: t.bodySmall),
              const SizedBox(height: 8),
              OutlinedButton(onPressed: onRetry, child: const Text('COBA LAGI')),
            ]),
          ),
        if (noKey) Panel(child: Text('Chat dengan agent belum aktif. $noKeyMsg', style: t.bodySmall)),
        if (!ready && error == null && disabled == null) Text('Menyiapkan sesi…', style: t.bodySmall),
        if (ready && disabled == null) ...[
          const SizedBox(height: 10),
          const Label('Coba tanyakan'),
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: suggestions.map((s) => ActionChip(label: Text(s, style: const TextStyle(fontSize: 12)), onPressed: () => onPick(s))).toList(),
          ),
        ],
      ],
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.m});
  final _Msg m;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    if (m.role == 'user') {
      return Padding(
        padding: const EdgeInsets.only(bottom: 10, left: 40),
        child: Align(
          alignment: Alignment.centerRight,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
            decoration: const BoxDecoration(color: RaqioColors.sunk, border: Border.fromBorderSide(BorderSide(color: RaqioColors.line))),
            child: Text(m.text),
          ),
        ),
      );
    }
    final showSteps = !m.done || (m.text.isEmpty && m.error == null);
    return Padding(
      padding: const EdgeInsets.only(bottom: 14, right: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (showSteps && m.steps.isEmpty) Text('Berpikir…', style: t.bodySmall),
          if (showSteps)
            ...m.steps.map((s) => Padding(
                  padding: const EdgeInsets.only(bottom: 3),
                  child: Text('• ${stepText(s)}', style: t.bodySmall),
                )),
          if (m.text.isNotEmpty) ...[
            if (m.steps.isNotEmpty && m.done) const SizedBox(height: 6),
            SelectableText(m.text, style: t.bodyMedium),
          ],
          if (m.error != null)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(m.error!, style: TextStyle(fontSize: 13, color: m.code == 'other' ? RaqioColors.bad : RaqioColors.warn)),
            ),
        ],
      ),
    );
  }
}
