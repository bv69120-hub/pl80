import { alpha, createTheme } from "@mui/material/styles";

const colors = {
  blue: "#003B7A",
  darkBlue: "#002B5C",
  yellow: "#FFD400",
  green: "#008C3A",
  red: "#E30613",
  pale: "#F5F8FC",
};

export const appTheme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: colors.blue,
      dark: colors.darkBlue,
      light: "#E7F0FA",
      contrastText: "#FFFFFF",
    },
    secondary: { main: colors.yellow, dark: "#E1BA00", contrastText: colors.darkBlue },
    success: { main: colors.green },
    error: { main: colors.red },
    background: { default: colors.pale, paper: "#FFFFFF" },
    text: { primary: "#14263A", secondary: "#60758C" },
    divider: "#DCE6F1",
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    h4: { fontWeight: 800, letterSpacing: "-0.03em" },
    h5: { fontWeight: 800, letterSpacing: "-0.02em" },
    h6: { fontWeight: 800 },
    button: { fontWeight: 800, textTransform: "none" },
  },
  components: {
    MuiCssBaseline: { styleOverrides: { body: { backgroundColor: colors.pale } } },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { borderRadius: 9, minHeight: 42, paddingInline: 20 } },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          border: "1px solid #DCE6F1",
          boxShadow: `0 12px 32px ${alpha(colors.darkBlue, 0.07)}`,
        },
      },
    },
    MuiChip: { styleOverrides: { root: { fontWeight: 700 } } },
    MuiTextField: { defaultProps: { variant: "outlined" } },
  },
});
