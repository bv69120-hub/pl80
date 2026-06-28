import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import QrCode2RoundedIcon from "@mui/icons-material/QrCode2Rounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/useAuth";

interface ClientMode {
  enabled: boolean;
  token: string;
  expiresAt: string | null;
}

export function SettingsPage() {
  const { token: authToken } = useAuth();
  const [mode, setMode] = useState<ClientMode | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const apiBaseUrl = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:3333";
  const clientUrl = mode
    ? `http://${window.location.hostname}:5173/client-print/${mode.token}`
    : "";

  const request = useCallback(
    async (path = "", method = "GET") => {
      if (!authToken) return;
      setBusy(true);
      setError(null);
      try {
        const response = await fetch(`${apiBaseUrl}/api/settings/client-mode${path}`, {
          method,
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (!response.ok) throw new Error("Impossible de modifier le mode client.");
        setMode((await response.json()) as ClientMode);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Une erreur est survenue.");
      } finally {
        setBusy(false);
      }
    },
    [apiBaseUrl, authToken],
  );

  useEffect(() => {
    void request();
  }, [request]);

  async function copyUrl() {
    await navigator.clipboard.writeText(clientUrl);
    setMessage("URL copiée.");
    window.setTimeout(() => setMessage(null), 2000);
  }
  async function update(path: string, confirmation: string) {
    await request(path, "POST");
    setMessage(confirmation);
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" color="primary.dark">
          Paramètres
        </Typography>
        <Typography color="text.secondary">Configuration du poste d’expédition.</Typography>
      </Box>
      {message && <Alert severity="success">{message}</Alert>}
      {error && <Alert severity="error">{error}</Alert>}
      <Card>
        <CardContent sx={{ p: { xs: 3, md: 4 } }}>
          {!mode ? (
            <Box sx={{ minHeight: 180, display: "grid", placeItems: "center" }}>
              <CircularProgress />
            </Box>
          ) : (
            <Stack spacing={3}>
              <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={2}>
                <Box>
                  <Typography variant="h5">Mode client</Typography>
                  <Typography color="text.secondary">
                    Contrôlez l’accès autonome depuis le QR code.
                  </Typography>
                </Box>
                <Chip
                  label={mode.enabled ? "Activé" : "Désactivé"}
                  color={mode.enabled ? "success" : "default"}
                />
              </Stack>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                <Button
                  variant="contained"
                  color="success"
                  disabled={busy || mode.enabled}
                  onClick={() => void update("/enable", "Mode client activé.")}
                >
                  Activer
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  disabled={busy || !mode.enabled}
                  onClick={() => void update("/disable", "Mode client désactivé.")}
                >
                  Désactiver
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<RefreshRoundedIcon />}
                  disabled={busy}
                  onClick={() => void update("/regenerate-token", "QR Code régénéré.")}
                >
                  Régénérer le QR Code
                </Button>
              </Stack>
              <Box sx={{ p: 3, borderRadius: 2, bgcolor: "background.default" }}>
                <Stack
                  direction={{ xs: "column", md: "row" }}
                  spacing={2}
                  alignItems={{ md: "center" }}
                >
                  <Box
                    sx={{
                      width: 72,
                      height: 72,
                      borderRadius: 2,
                      bgcolor: "primary.light",
                      color: "primary.main",
                      display: "grid",
                      placeItems: "center",
                      flexShrink: 0,
                    }}
                  >
                    <QrCode2RoundedIcon sx={{ fontSize: 48 }} />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography fontWeight={800} sx={{ mb: 1 }}>
                      URL client sécurisée
                    </Typography>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                      <TextField fullWidth value={clientUrl} InputProps={{ readOnly: true }} />
                      <Button
                        variant="contained"
                        startIcon={<ContentCopyRoundedIcon />}
                        onClick={() => void copyUrl()}
                      >
                        Copier
                      </Button>
                    </Stack>
                  </Box>
                </Stack>
              </Box>
            </Stack>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}
