import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { FormEvent, useState } from "react";
import { useEffect } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { apiUrl } from "../api/apiUrl";

export function LoginPage() {
  const { isAuthenticated, isLoading, login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [setupCheckError, setSetupCheckError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [setupCheckAttempt, setSetupCheckAttempt] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let active = true;
    setCheckingSetup(true);
    setSetupCheckError(null);
    async function checkSetup() {
      try {
        const response = await fetch(apiUrl("/api/auth/setup-status"));
        if (!response.ok) {
          throw new Error(`API HTTP ${response.status}`);
        }
        const status = (await response.json()) as { setupRequired?: unknown };
        if (typeof status.setupRequired !== "boolean") {
          throw new Error("Invalid setup status response");
        }
        if (!status.setupRequired) return;

        const desktopBridge = window.bvDesktop;
        const packagedElectron =
          new URLSearchParams(window.location.search).get("bv-desktop") === "packaged";
        if (!desktopBridge?.isElectron) {
          if (packagedElectron) throw new Error("Electron bridge unavailable");
          return;
        }
        const bootstrapToken = await desktopBridge.getBootstrapToken?.();
        if (!bootstrapToken) {
          throw new Error("Secure first-run authorization unavailable");
        }
        if (active) {
          navigate("/first-run", { replace: true });
        }
      } catch {
        if (active) {
          setSetupCheckError(
            "Impossible de vérifier la première configuration. Vérifiez que l’API locale est démarrée, puis réessayez.",
          );
        }
      } finally {
        if (active) setCheckingSetup(false);
      }
    }
    void checkSetup();
    return () => {
      active = false;
    };
  }, [navigate, setupCheckAttempt]);

  const redirectTo =
    typeof location.state === "object" &&
    location.state &&
    "from" in location.state &&
    typeof location.state.from === "object" &&
    location.state.from &&
    "pathname" in location.state.from &&
    typeof location.state.from.pathname === "string"
      ? location.state.from.pathname
      : "/dashboard";

  if (isLoading || checkingSetup) {
    return (
      <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <CircularProgress />
      </Box>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await login(username, password);
      navigate(redirectTo, { replace: true });
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Connexion impossible");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        p: 2,
        bgcolor: "background.default",
      }}
    >
      <Card sx={{ width: "min(100%, 460px)" }}>
        <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
          <Stack spacing={3}>
            <Stack spacing={1.5} alignItems="center" textAlign="center">
              <Box
                sx={{
                  width: 56,
                  height: 56,
                  borderRadius: 2,
                  display: "grid",
                  placeItems: "center",
                  color: "common.white",
                  bgcolor: "primary.main",
                  boxShadow: "inset -14px 0 0 rgba(217, 48, 37, 0.95)",
                }}
              >
                <LockOutlinedIcon />
              </Box>
              <Box>
                <Typography variant="h5">BV Expédition Pro</Typography>
                <Typography color="text.secondary">Connexion sécurisée</Typography>
              </Box>
            </Stack>

            {error && (
              <Alert severity="error" sx={{ whiteSpace: "pre-line", overflowWrap: "anywhere" }}>
                {error}
              </Alert>
            )}
            {setupCheckError && (
              <Alert
                severity="error"
                action={
                  <Button
                    color="inherit"
                    size="small"
                    onClick={() => setSetupCheckAttempt((attempt) => attempt + 1)}
                  >
                    Réessayer
                  </Button>
                }
              >
                {setupCheckError}
              </Alert>
            )}

            <Stack component="form" spacing={2.5} onSubmit={handleSubmit}>
              <TextField
                label="Nom d'utilisateur"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                required
                fullWidth
              />
              <TextField
                label="Mot de passe"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
                fullWidth
              />
              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={isSubmitting || Boolean(setupCheckError)}
                startIcon={isSubmitting ? <CircularProgress color="inherit" size={18} /> : null}
              >
                Se connecter
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
