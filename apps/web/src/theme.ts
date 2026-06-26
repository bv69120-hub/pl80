import { createTheme } from "@mui/material/styles";

export const appTheme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#174ea6",
      dark: "#0d2f6f",
      light: "#e8f0fe",
      contrastText: "#ffffff",
    },
    secondary: {
      main: "#d93025",
      dark: "#9f1c16",
      light: "#fce8e6",
      contrastText: "#ffffff",
    },
    background: {
      default: "#f6f8fc",
      paper: "#ffffff",
    },
    text: {
      primary: "#172033",
      secondary: "#5f6f89",
    },
  },
  shape: {
    borderRadius: 8,
  },
  typography: {
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    h4: {
      fontWeight: 800,
    },
    h5: {
      fontWeight: 800,
    },
    h6: {
      fontWeight: 800,
    },
    button: {
      fontWeight: 700,
      textTransform: "none",
    },
  },
  components: {
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          border: "1px solid #d9e2f2",
          boxShadow: "0 10px 28px rgba(23, 32, 51, 0.08)",
        },
      },
    },
  },
});
