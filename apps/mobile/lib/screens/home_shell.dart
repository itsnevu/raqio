import 'package:flutter/material.dart';

import '../app.dart';
import '../theme.dart';
import 'market_screen.dart';
import 'prospects_screen.dart';
import 'settings_screen.dart';
import 'watch_screen.dart';

/// Navigasi bawah: Riset, Prospek, Pantau, Akun. Sama dengan menu atas di web.
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _tab = 0;

  @override
  void initState() {
    super.initState();
    final api = ApiScope.of(context);
    if (api.lastMe == null) api.me().then<void>((_) {}).catchError((_) {}); // bilah tamu; gagal pun tidak apa-apa
  }

  @override
  Widget build(BuildContext context) {
    final api = ApiScope.of(context);
    return Scaffold(
      body: Column(
        children: [
          ListenableBuilder(
            listenable: api,
            builder: (context, _) => api.lastMe?.guest == true
                ? Material(
                    color: RaqioColors.sunk,
                    child: SafeArea(
                      bottom: false,
                      child: InkWell(
                        onTap: () => setState(() => _tab = 3),
                        child: Padding(
                          padding: const EdgeInsets.fromLTRB(16, 8, 12, 8),
                          child: Row(children: [
                            const Expanded(child: Text('Mode tamu: hasil instan, kuota kecil. Simpan akun supaya riset tidak hilang.', style: TextStyle(fontSize: 12, color: RaqioColors.muted))),
                            const SizedBox(width: 8),
                            Text('SIMPAN AKUN', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 0.6, color: RaqioColors.good)),
                          ]),
                        ),
                      ),
                    ),
                  )
                : const SizedBox.shrink(),
          ),
          Expanded(
            child: IndexedStack(
              index: _tab,
              children: const [MarketScreen(), ProspectsScreen(), WatchScreen(), SettingsScreen()],
            ),
          ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.map_outlined), selectedIcon: Icon(Icons.map), label: 'RISET'),
          NavigationDestination(icon: Icon(Icons.view_kanban_outlined), selectedIcon: Icon(Icons.view_kanban), label: 'PROSPEK'),
          NavigationDestination(icon: Icon(Icons.radar_outlined), selectedIcon: Icon(Icons.radar), label: 'PANTAU'),
          NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'AKUN'),
        ],
      ),
    );
  }
}
