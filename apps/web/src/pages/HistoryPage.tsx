import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import {
  Alert,
  Box,
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
  user: { username: string } | null;
}

export function HistoryPage() {
  const { token } = useAuth();
  const [jobs, setJobs] = useState<HistoryJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
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
                      <Chip
                        size="small"
                        label={job.status}
                        color={
                          job.status === "PRINTED"
                            ? "success"
                            : job.status === "FAILED"
                              ? "error"
                              : "default"
                        }
                      />
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
