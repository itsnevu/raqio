export const tokens = {
  color: {
    ink: "#111111", panel: "#242424", paper: "#F7F7F7", white: "#FFFFFF",
    cream: "#292929", lightText: "#E5E5E5", muted: "#BDBDBD",
    amber: "#FFB020", orange: "#FF8A3D", coral: "#FF5A4E", rust: "#FFB020",
  },
  fontFamily: { display: "Public Sans, Helvetica Neue, Arial, sans-serif", body: "Public Sans, Helvetica Neue, Arial, sans-serif" },
  fontSize: { headline: "clamp(2.75rem, 6.2vw, 4.8125rem)", section: "clamp(2.5rem, 4.3vw, 3.375rem)", body: "1.125rem" },
  spacing: { gutter: "clamp(1.25rem, 5vw, 5rem)", section: "clamp(4.5rem, 10vw, 9rem)" },
  radius: { card: "1.25rem", control: "999px" },
  shadow: { card: "0 20px 70px #00000052" },
} as const;
