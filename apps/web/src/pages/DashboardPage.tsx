import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";
import LocalPrintshopOutlinedIcon from "@mui/icons-material/LocalPrintshopOutlined";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import { Box, Button, Card, CardContent, Chip, Grid, Stack, Typography } from "@mui/material";
import { useNavigate } from "react-router-dom";

const metrics = [
  {
    label: "Impressions aujourd’hui",
    value: "0",
    helper: "Depuis minuit",
    icon: <PrintOutlinedIcon />,
  },
  {
    label: "En attente",
    value: "0",
    helper: "File d’attente vide",
    icon: <ScheduleOutlinedIcon />,
  },
  {
    label: "Terminées",
    value: "0",
    helper: "Aujourd’hui",
    icon: <CheckCircleOutlineRoundedIcon />,
  },
];

export function DashboardPage() {
  const navigate = useNavigate();
  return (
    <Stack spacing={3.5}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "stretch", sm: "center" }}
        gap={2}
      >
        <Box>
          <Typography variant="h4" color="primary.dark">
            Bonjour 👋
          </Typography>
          <Typography color="text.secondary">Pilotez vos impressions en un coup d’œil.</Typography>
        </Box>
        <Button
          variant="contained"
          color="secondary"
          size="large"
          startIcon={<AddRoundedIcon />}
          onClick={() => navigate("/new-label")}
          sx={{ minHeight: 54, px: 3.5, fontSize: 16 }}
        >
          Nouveau bordereau
        </Button>
      </Stack>
      <Grid container spacing={2.5}>
        {metrics.map((metric) => (
          <Grid item xs={12} sm={4} key={metric.label}>
            <Card
              sx={{
                height: "100%",
                overflow: "hidden",
                position: "relative",
                "&:before": {
                  content: '""',
                  position: "absolute",
                  inset: "0 auto 0 0",
                  width: 5,
                  bgcolor: "primary.main",
                },
              }}
            >
              <CardContent sx={{ p: 3 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                  <Box>
                    <Typography variant="body2" color="text.secondary" fontWeight={700}>
                      {metric.label}
                    </Typography>
                    <Typography variant="h4" sx={{ my: 0.5 }}>
                      {metric.value}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {metric.helper}
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: 2,
                      display: "grid",
                      placeItems: "center",
                      bgcolor: "primary.light",
                      color: "primary.main",
                    }}
                  >
                    {metric.icon}
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
      <Grid container spacing={2.5}>
        <Grid item xs={12} md={7}>
          <Card sx={{ height: "100%" }}>
            <CardContent sx={{ p: { xs: 3, md: 4 } }}>
              <Typography variant="overline" color="primary.main" fontWeight={900}>
                Démarrage rapide
              </Typography>
              <Typography variant="h5" sx={{ mt: 0.5, mb: 1 }}>
                Un PDF, quelques secondes, c’est parti.
              </Typography>
              <Typography color="text.secondary" sx={{ mb: 3, maxWidth: 580 }}>
                Déposez votre bordereau, vérifiez son aperçu puis choisissez le nombre de copies à
                imprimer.
              </Typography>
              <Button
                variant="contained"
                color="secondary"
                size="large"
                startIcon={<AddRoundedIcon />}
                onClick={() => navigate("/new-label")}
              >
                Créer un bordereau
              </Button>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={5}>
          <Card sx={{ height: "100%", bgcolor: "primary.dark", color: "common.white", border: 0 }}>
            <CardContent sx={{ p: { xs: 3, md: 4 } }}>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                <Box
                  sx={{
                    width: 56,
                    height: 56,
                    borderRadius: 2,
                    display: "grid",
                    placeItems: "center",
                    bgcolor: "rgba(255,255,255,.1)",
                    color: "secondary.main",
                  }}
                >
                  <LocalPrintshopOutlinedIcon fontSize="large" />
                </Box>
                <Chip label="Prête" color="success" sx={{ color: "common.white" }} />
              </Stack>
              <Typography variant="h5" sx={{ mt: 3 }}>
                PL80E
              </Typography>
              <Typography sx={{ color: "rgba(255,255,255,.7)", mb: 2 }}>
                Imprimante d’étiquettes
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <Box sx={{ width: 9, height: 9, borderRadius: "50%", bgcolor: "success.main" }} />
                <Typography variant="body2" fontWeight={700}>
                  Connectée et disponible
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}
