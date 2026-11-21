export const tokens = {
  color: {
    ink: "#130F0C", panel: "#291A19", paper: "#FCF8F1", white: "#FFFFFF",
    cream: "#F8EDE0", lightText: "#E5E5E5", muted: "#5B4941",
    amber: "#FFB020", orange: "#FF8A3D", coral: "#FF5A4E", rust: "#A13622",
  },
  fontFamily: { display: "Newsreader, Georgia, serif", body: "Instrument Sans, Arial, sans-serif" },
  fontSize: { headline: "clamp(2.75rem, 6.2vw, 4.8125rem)", section: "clamp(2.5rem, 4.3vw, 3.375rem)", body: "1.125rem" },
  spacing: { gutter: "clamp(1.25rem, 5vw, 5rem)", section: "clamp(4.5rem, 10vw, 9rem)" },
  radius: { card: "1.25rem", control: "999px" },
  shadow: { card: "0 20px 70px #1c130c29" },
} as const;
