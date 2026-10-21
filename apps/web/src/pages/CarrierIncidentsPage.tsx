import AddAlertOutlinedIcon from "@mui/icons-material/AddAlertOutlined";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  FormControl,
  FormControlLabel,
  FormLabel,
  InputLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Stack,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { apiUrl } from "../api/apiUrl";
import { useAuth } from "../auth/useAuth";

const carriers = [
  ["CHRONOPOST", "Chronopost"],
  ["COLISSIMO", "Colissimo"],
  ["MONDIAL_RELAY", "Mondial Relay"],
  ["VINTED", "Vinted / Vinted Go"],
  ["RELAIS_COLIS", "Relais Colis"],
] as const;
const labelTypes = [
  ["CLASSIC", "Classique"],
  ["SHOP2SHOP", "Shop2Shop"],
  ["VINTED_GO", "Vinted Go"],
  ["A4_MULTI_PANEL", "A4 à plusieurs panneaux"],
  ["OTHER", "Autre modèle"],
] as const;
const cropResults = [
  ["CORRECT", "Correct"],
  ["INCORRECT", "Incorrect"],
  ["UNCERTAIN", "Incertain"],
] as const;
const issueTypes = [
  ["NONE", "Aucun problème"],
  ["LABEL_CUT", "Étiquette coupée"],
  ["BARCODE_CUT", "Code-barres tronqué"],
  ["WRONG_ORIENTATION", "Mauvaise orientation"],
  ["WRONG_SCALE", "Mauvaise mise à l’échelle"],
  ["TOO_SMALL", "Étiquette trop petite"],
  ["MISSING_INFORMATION", "Informations manquantes"],
  ["WRONG_REGION", "Mauvaise zone extraite"],
  ["OTHER", "Autre anomalie"],
] as const;
const printResults = [
  ["SUCCESS", "Réussie"],
  ["FAILED", "Échouée"],
  ["NOT_PRINTED", "Non imprimée"],
] as const;

type IncidentForm = {
  carrier: string;
  labelType: string;
  cropResult: string;
  issueType: string;
  printResult: string;
  physicalVerified: boolean;
};

interface CarrierIncident extends IncidentForm {
  id: string;
  createdAt: string;
}

const initialForm: IncidentForm = {
  carrier: carriers[0][0],
  labelType: labelTypes[0][0],
  cropResult: cropResults[0][0],
  issueType: issueTypes[0][0],
  printResult: printResults[2][0],
  physicalVerified: false,
};

function optionLabel(options: readonly (readonly [string, string])[], value: string): string {
  return options.find(([key]) => key === value)?.[1] ?? value;
}

export function CarrierIncidentsPage() {
  const { token } = useAuth();
  const [form, setForm] = useState<IncidentForm>(initialForm);
  const [incidents, setIncidents] = useState<CarrierIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadIncidents = useCallback(async () => {
    if (!token) return;
    const response = await fetch(apiUrl("/api/incidents"), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error("Impossible de charger les rapports d’incident.");
    const data = (await response.json()) as { incidents: CarrierIncident[] };
    setIncidents(data.incidents);
  }, [token]);

  useEffect(() => {
    void loadIncidents()
      .catch(() => setError("Impossible de charger les rapports d’incident."))
      .finally(() => setLoading(false));
  }, [loadIncidents]);

  function update<K extends keyof IncidentForm>(key: K, value: IncidentForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submitIncident() {
    if (!token || saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(apiUrl("/api/incidents"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });
      if (!response.ok) {
        const result = (await response.json()) as { message?: string };
        throw new Error(result.message ?? "Impossible d’enregistrer l’incident.");
      }
      const result = (await response.json()) as { incident: CarrierIncident };
      setIncidents((current) => [result.incident, ...current].slice(0, 100));
      setForm(initialForm);
      setNotice("Le rapport d’incident a été enregistré.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Échec de l’enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" color="primary.dark">
          Incidents transporteurs
        </Typography>
        <Typography color="text.secondary">
          Signalez les problèmes de préparation et d’impression sans joindre le bordereau.
        </Typography>
      </Box>

      <Alert severity="warning">
        Ne saisissez aucun nom, adresse, numéro de suivi, nom de fichier ou autre donnée
        personnelle. Le formulaire n’accepte que des catégories prédéfinies.
      </Alert>
      {error && <Alert severity="error">{error}</Alert>}
      {notice && <Alert severity="success">{notice}</Alert>}

      <Card>
        <CardContent>
          <Stack spacing={2.5}>
            <Typography variant="h6">Nouveau rapport</Typography>
            <FormControl fullWidth>
              <InputLabel id="carrier-label">Transporteur</InputLabel>
              <Select
                labelId="carrier-label"
                label="Transporteur"
                value={form.carrier}
                onChange={(event) => update("carrier", event.target.value)}
              >
                {carriers.map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel id="label-type-label">Type de bordereau</InputLabel>
              <Select
                labelId="label-type-label"
                label="Type de bordereau"
                value={form.labelType}
                onChange={(event) => update("labelType", event.target.value)}
              >
                {labelTypes.map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl>
              <FormLabel>Résultat du recadrage</FormLabel>
              <RadioGroup
                row
                value={form.cropResult}
                onChange={(event) => update("cropResult", event.target.value)}
              >
                {cropResults.map(([value, label]) => (
                  <FormControlLabel key={value} value={value} control={<Radio />} label={label} />
                ))}
              </RadioGroup>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel id="issue-type-label">Problème constaté</InputLabel>
              <Select
                labelId="issue-type-label"
                label="Problème constaté"
                value={form.issueType}
                onChange={(event) => update("issueType", event.target.value)}
              >
                {issueTypes.map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel id="print-result-label">Résultat de l’impression</InputLabel>
              <Select
                labelId="print-result-label"
                label="Résultat de l’impression"
                value={form.printResult}
                onChange={(event) => update("printResult", event.target.value)}
              >
                {printResults.map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl>
              <FormLabel>Vérification physique sur l’imprimante</FormLabel>
              <RadioGroup
                row
                value={String(form.physicalVerified)}
                onChange={(event) => update("physicalVerified", event.target.value === "true")}
              >
                <FormControlLabel value="true" control={<Radio />} label="Oui" />
                <FormControlLabel value="false" control={<Radio />} label="Non" />
              </RadioGroup>
            </FormControl>
            <Button
              variant="contained"
              startIcon={<AddAlertOutlinedIcon />}
              onClick={() => void submitIncident()}
              disabled={saving}
            >
              {saving ? "Enregistrement…" : "Enregistrer le rapport"}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="h6">Rapports récents</Typography>
            {loading ? (
              <Typography color="text.secondary">Chargement…</Typography>
            ) : incidents.length === 0 ? (
              <Typography color="text.secondary">Aucun rapport enregistré.</Typography>
            ) : (
              incidents.map((incident) => (
                <Box
                  key={incident.id}
                  sx={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 1,
                    alignItems: "center",
                    borderBottom: "1px solid",
                    borderColor: "divider",
                    pb: 1.5,
                  }}
                >
                  <Typography sx={{ minWidth: 150 }}>
                    {new Intl.DateTimeFormat("fr-FR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    }).format(new Date(incident.createdAt))}
                  </Typography>
                  <Chip size="small" label={optionLabel(carriers, incident.carrier)} />
                  <Chip size="small" label={optionLabel(labelTypes, incident.labelType)} />
                  <Chip size="small" label={optionLabel(cropResults, incident.cropResult)} />
                  <Chip size="small" label={optionLabel(issueTypes, incident.issueType)} />
                  <Chip size="small" label={optionLabel(printResults, incident.printResult)} />
                  <Chip
                    size="small"
                    label={incident.physicalVerified ? "Vérifié physiquement" : "Non vérifié"}
                    color={incident.physicalVerified ? "success" : "default"}
                  />
                </Box>
              ))
            )}
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}
