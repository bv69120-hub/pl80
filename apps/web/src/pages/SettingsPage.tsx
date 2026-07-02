import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "../auth/useAuth";
import { apiUrl } from "../api/apiUrl";

interface ClientMode {
  enabled: boolean;
  token: string;
  expiresAt: string | null;
}

interface CloudStatus {
  mode: "LOCAL" | "CLOUD";
  connection: "CONNECTED" | "CONNECTING" | "DISCONNECTED";
  connected: boolean;
  storeId: string;
  cloudUrl: string | null;
}

export function SettingsPage() {
  const { token: authToken } = useAuth();
  const [mode, setMode] = useState<ClientMode | null>(null);
  const [cloud, setCloud] = useState<CloudStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const configuredClientBaseUrl = import.meta.env.VITE_PUBLIC_CLIENT_BASE_URL?.trim();
  const clientBaseUrl = (configuredClientBaseUrl || window.location.origin).replace(/\/+$/, "");
  const localClientUrl = mode ? `${clientBaseUrl}/client-print/${mode.token}` : "";
  const clientUrl = cloud?.mode === "CLOUD" && cloud.cloudUrl ? cloud.cloudUrl : localClientUrl;

  const loadCloud = useCallback(async () => {
    if (!authToken) return;
    try {
      const response = await fetch(apiUrl("/api/cloud/status"), {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (response.ok) setCloud((await response.json()) as CloudStatus);
    } catch {
      /* Le statut déconnecté reste visible. */
    }
  }, [authToken]);

  const request = useCallback(
    async (path = "", method = "GET") => {
      if (!authToken) return;
      setBusy(true);
      setError(null);
      try {
        const response = await fetch(apiUrl(`/api/settings/client-mode${path}`), {
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
    [authToken],
  );

  useEffect(() => {
    void request();
    void loadCloud();
    const timer = window.setInterval(() => void loadCloud(), 5000);
    return () => window.clearInterval(timer);
  }, [request, loadCloud]);

  async function changeConnectionMode(nextMode: "LOCAL" | "CLOUD") {
    if (!authToken) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(apiUrl("/api/cloud/mode"), {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ mode: nextMode }),
      });
      if (!response.ok) throw new Error("Impossible de changer le mode de connexion.");
      setCloud((await response.json()) as CloudStatus);
      setMessage(nextMode === "CLOUD" ? "Mode Cloud activé." : "Mode Local activé.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Une erreur est survenue.");
    } finally {
      setBusy(false);
    }
  }

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
          <Stack spacing={2}>
            <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" gap={2}>
              <Box>
                <Typography variant="h5">État de connexion Cloud</Typography>
                <Typography color="text.secondary">
                  La connexion est uniquement sortante depuis ce PC.
                </Typography>
              </Box>
              <Chip
                label={cloud?.connected ? "🟢 connecté" : "🔴 déconnecté"}
                color={cloud?.connected ? "success" : "error"}
                variant={cloud?.connected ? "filled" : "outlined"}
              />
            </Stack>
            <FormControlLabel
              control={
                <Switch
                  checked={cloud?.mode === "CLOUD"}
                  disabled={busy || !cloud}
                  onChange={(_, checked) => void changeConnectionMode(checked ? "CLOUD" : "LOCAL")}
                />
              }
              label={cloud?.mode === "CLOUD" ? "Mode Cloud" : "Mode Local"}
            />
            {cloud?.mode === "CLOUD" && !cloud.storeId && (
              <Alert severity="warning">
                STORE_ID et STORE_SECRET doivent être configurés sur ce poste.
              </Alert>
            )}
          </Stack>
        </CardContent>
      </Card>
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
                      width: 196,
                      height: 196,
                      borderRadius: 2,
                      bgcolor: "common.white",
                      display: "grid",
                      placeItems: "center",
                      flexShrink: 0,
                      p: 1,
                      border: "1px solid",
                      borderColor: "divider",
                    }}
                  >
                    <QRCodeSVG value={clientUrl} size={176} level="M" marginSize={1} />
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
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      display="block"
                      sx={{ mt: 1 }}
                    >
                      Cette adresse doit être accessible depuis le téléphone du client.
                    </Typography>
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
