import AdminPanelSettingsOutlinedIcon from "@mui/icons-material/AdminPanelSettingsOutlined";
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
import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { apiUrl } from "../api/apiUrl";

export function FirstRunPage() {
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(false);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [checkAttempt, setCheckAttempt] = useState(0);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setAvailabilityError(null);
    async function checkSetup() {
      try {
        const response = await fetch(apiUrl("/api/auth/setup-status"));
        if (!response.ok) throw new Error(`API HTTP ${response.status}`);
        const status = (await response.json()) as { setupRequired?: boolean };
        if (typeof status.setupRequired !== "boolean") throw new Error("Invalid setup status");
        if (!status.setupRequired) {
          if (active) setAvailable(false);
          return;
        }

        const desktopBridge = window.bvDesktop;
        const packagedElectron =
          new URLSearchParams(window.location.search).get("bv-desktop") === "packaged";
        if (!desktopBridge?.isElectron) {
          if (packagedElectron) throw new Error("Electron bridge unavailable");
          if (active) setAvailable(false);
          return;
        }
        const bootstrapToken = await desktopBridge.getBootstrapToken?.();
        if (!bootstrapToken) throw new Error("Secure first-run authorization unavailable");
        if (active) setAvailable(true);
      } catch {
        if (active) {
          setAvailable(false);
          setAvailabilityError(
            "La première configuration n’est pas disponible. Vérifiez l’API locale et réessayez.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void checkSetup();
    return () => {
      active = false;
    };
  }, [checkAttempt]);

  if (loading) {
    return (
      <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <CircularProgress />
      </Box>
    );
  }
  if (!available && !availabilityError) return <Navigate to="/login" replace />;

  async function createAdministrator(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password !== confirmation) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    setSaving(true);
    try {
      const bootstrapToken = await window.bvDesktop?.getBootstrapToken?.();
      if (!bootstrapToken)
        throw new Error("Initialisation indisponible. Redémarrez l’application.");
      const response = await fetch(apiUrl("/api/auth/bootstrap"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-BV-Bootstrap-Token": bootstrapToken,
        },
        body: JSON.stringify({ username, password }),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(result.message ?? "Impossible de créer le compte.");
      navigate("/login", { replace: true });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Échec de l’initialisation.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", p: 2 }}>
      <Card sx={{ width: "min(100%, 480px)" }}>
        <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
          <Stack spacing={3}>
            <Stack alignItems="center" spacing={1}>
              <AdminPanelSettingsOutlinedIcon color="primary" sx={{ fontSize: 48 }} />
              <Typography component="h1" variant="h5">
                Première configuration
              </Typography>
              <Typography color="text.secondary" textAlign="center">
                Créez le compte administrateur. Aucun mot de passe par défaut n’est installé.
              </Typography>
            </Stack>
            {availabilityError && (
              <Alert
                severity="error"
                action={
                  <Button
                    color="inherit"
                    size="small"
                    onClick={() => setCheckAttempt((attempt) => attempt + 1)}
                  >
                    Réessayer
                  </Button>
                }
              >
                {availabilityError}
              </Alert>
            )}
            {error && <Alert severity="error">{error}</Alert>}
            <Stack
              component="form"
              spacing={2}
              onSubmit={(event) => void createAdministrator(event)}
            >
              <TextField
                label="Nom d’utilisateur administrateur"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                inputProps={{ minLength: 3, maxLength: 40, pattern: "[A-Za-z0-9._-]+" }}
                autoComplete="username"
                required
              />
              <TextField
                label="Mot de passe (12 caractères minimum)"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                inputProps={{ minLength: 12, maxLength: 128 }}
                autoComplete="new-password"
                required
              />
              <TextField
                label="Confirmer le mot de passe"
                type="password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                inputProps={{ minLength: 12, maxLength: 128 }}
                autoComplete="new-password"
                required
              />
              <Button
                type="submit"
                variant="contained"
                disabled={saving || !available || Boolean(availabilityError)}
              >
                {saving ? "Création…" : "Créer le compte administrateur"}
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
