import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  CircularProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { useAuth } from "../auth/useAuth";
import { apiUrl } from "../api/apiUrl";

interface HistoryJob {
  id: string;
  filename: string;
  status: string;
  source: "CLIENT" | "EMPLOYEE";
  printerName: string;
  copies: number;
  createdAt: string;
  errorMessage: string | null;
  user: { username: string } | null;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    PENDING: "En attente",
    PRINTING: "Envoi en cours",
    REVIEW_REQUIRED: "Vérification requise · non imprimé",
    SUBMITTED: "Commande terminée, spooler non observé",
    SPOOLER_OBSERVED: "Travail observé dans le spooler",
    FAILED: "Échec",
    PRINTED: "Ancien statut non vérifiable",
  };
  return labels[status] ?? status;
}

export function HistoryPage() {
  const { token } = useAuth();
  const [jobs, setJobs] = useState<HistoryJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [downloadError, setDownloadError] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function downloadForReview(jobId: string) {
    if (!token || downloadingId) return;
    setDownloadingId(jobId);
    setDownloadError(false);
    try {
      const response = await fetch(
        apiUrl(`/api/print-jobs/${encodeURIComponent(jobId)}/original`),
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!response.ok) throw new Error("PDF indisponible");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `bordereau-a-verifier-${jobId}.pdf`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setDownloadError(true);
    } finally {
      setDownloadingId(null);
    }
  }
  useEffect(() => {
    if (!token) return;
    fetch(apiUrl("/api/print-jobs"), { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<{ jobs: HistoryJob[] }>;
      })
      .then((data) => setJobs(data.jobs))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [token]);
  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" color="primary.dark">
          Historique
        </Typography>
        <Typography color="text.secondary">Toutes les impressions client et employé.</Typography>
      </Box>
      {error && <Alert severity="error">Impossible de charger l’historique.</Alert>}
      {downloadError && (
        <Alert severity="error">
          Impossible de récupérer le PDF source pour sa vérification locale.
        </Alert>
      )}
      <Alert severity="warning">
        Les bordereaux marqués « Vérification requise » n’ont pas été imprimés automatiquement.
        Téléchargez le PDF source et faites-le examiner dans le Centre de test avant toute
        impression.
      </Alert>
      <Card>
        {loading ? (
          <Box sx={{ minHeight: 260, display: "grid", placeItems: "center" }}>
            <CircularProgress />
          </Box>
        ) : jobs.length === 0 ? (
          <Stack sx={{ minHeight: 280 }} alignItems="center" justifyContent="center" spacing={1}>
            <HistoryOutlinedIcon color="primary" sx={{ fontSize: 52 }} />
            <Typography variant="h6">Aucune impression</Typography>
          </Stack>
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Fichier</TableCell>
                  <TableCell>Source</TableCell>
                  <TableCell>Imprimante</TableCell>
                  <TableCell>Statut</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell>
                      {new Intl.DateTimeFormat("fr-FR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      }).format(new Date(job.createdAt))}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={700}>
                        {job.filename}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {job.user?.username ?? "Portail client"}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={job.source === "CLIENT" ? "Client" : "Employé"}
                        color={job.source === "CLIENT" ? "secondary" : "primary"}
                      />
                    </TableCell>
                    <TableCell>{job.printerName}</TableCell>
                    <TableCell>
                      <Stack spacing={0.75} alignItems="flex-start">
                        <Chip
                          size="small"
                          label={statusLabel(job.status)}
                          color={
                            job.status === "FAILED"
                              ? "error"
                              : job.status === "SPOOLER_OBSERVED"
                                ? "warning"
                                : job.status === "SUBMITTED"
                                  ? "info"
                                  : "default"
                          }
                        />
                        {job.status === "FAILED" && job.errorMessage && (
                          <Typography
                            variant="caption"
                            color="error.main"
                            sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxWidth: 420 }}
                          >
                            {job.errorMessage}
                          </Typography>
                        )}
                        {job.status === "REVIEW_REQUIRED" && (
                          <Button
                            size="small"
                            startIcon={<DownloadOutlinedIcon />}
                            onClick={() => void downloadForReview(job.id)}
                            disabled={downloadingId !== null}
                          >
                            {downloadingId === job.id
                              ? "Téléchargement…"
                              : "Télécharger pour revue"}
                          </Button>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Card>
    </Stack>
  );
}
