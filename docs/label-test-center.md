# Centre de test des etiquettes

## Acces et conservation

Le Centre est accessible aux seuls comptes `ADMIN` dans l'application employe,
route `/label-test-center`. Toutes les routes `/api/label-tests` verifient le
JWT et le role administrateur cote serveur. Le Cloud Relay public ne monte pas
ces routes.

Les PDF sont ecrits dans un repertoire temporaire sur la machine qui heberge
l'API et sont supprimes a l'expiration (30 minutes) ou a la suppression
manuelle. Ne jamais ajouter de PDF client au depot, aux fixtures permanentes,
aux rapports partages ou aux journaux. Les tests automatises du Centre
n'utilisent que des PDF synthetiques.

## Procedure de validation d'un transporteur

Pour chaque variante de modele et transporteur :

1. Obtenir un PDF representatif dont les donnees personnelles ont ete
   anonymisees. Verifier que l'anonymisation conserve la mise en page, les
   polices, les images, les codes-barres et les zones de decoupe. Ne pas
   anonymiser en masquant ou recadrant les elements qui doivent etre testes.
2. Ouvrir le Centre de test avec un compte administrateur, choisir le
   transporteur, renseigner la variante et importer le document.
3. Examiner les trois vues avant de marquer la revue visuelle :
   - **A — Original** : identifier l'etiquette attendue et les zones annexes.
   - **B — Zone extraite** : confirmer que toute l'etiquette est presente et
     que les instructions, recus ou formulaires annexes sont exclus.
   - **C — PDF final** : confirmer le format 100 x 150 mm, l'orientation, les
     proportions, les marges, l'adresse et la lisibilite des codes-barres/QR.
4. Comparer la categorie choisie au transporteur detecte et lire chaque
   avertissement. Une categorie choisie, un traitement sans erreur ou des
   dimensions correctes ne constituent pas une validation visuelle.
5. N'effectuer une impression physique que sur action explicite d'un operateur.
   Inspecter la sortie PL80E pour verifier le format, l'orientation, l'absence
   de coupe, la lisibilite et le scan lorsque disponible. La reponse du serveur
   ne confirme jamais une impression physique.
6. Enregistrer le resultat, exporter le rapport JSON si necessaire, puis
   supprimer l'analyse. Le rapport exporte ne contient pas les pages PDF.

## Categories et references

Le Centre propose Chronopost, Colissimo, Mondial Relay, Vinted / Vinted Go et
Relais Colis. Aucun PDF representatif permanent/anonymise de ces cinq categories
n'est present parmi les fichiers suivis du depot. Il faut donc obtenir et
anonymiser des references avant d'evaluer leurs variantes reelles.

Le moteur printer ne dispose pas encore d'une strategie de detection dediee a
Relais Colis. Les resultats de cette categorie doivent rester a verifier et ne
pas etre declares conformes sur la seule base d'une preparation generique.
L'absence d'une reference ou d'une revue visuelle interdit egalement de
declarer une variante conforme.
