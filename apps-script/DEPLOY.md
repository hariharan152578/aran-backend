# Deploying the Apps Script webhook

`Code.gs` in this folder is the version Aran v2 expects. It fixes two problems in
the prototype script and adds a lock. **Deploy it to every workbook that backs a
template.**

## Steps

1. Open the Google Sheet workbook.
2. **Extensions → Apps Script**.
3. Select all the existing code and replace it with the contents of `Code.gs`.
4. Save (Ctrl+S).
5. **Deploy → Manage deployments → ✏️ (edit) → Version: New version → Deploy**.

   Use **Manage deployments**, not "New deployment". Editing the existing
   deployment keeps the same `/exec` URL, so template records already saved in
   Aran keep working. Creating a new deployment issues a different URL and every
   stored template would need re-pointing.

6. Confirm the deployment settings are:
   - **Execute as:** Me
   - **Who has access:** Anyone

   Without "Anyone", the endpoint returns an HTML login page instead of JSON and
   Aran reports `NON_JSON`.

## Verify the deployment

```bash
curl -sL "https://script.google.com/macros/s/XXXX/exec?action=structure" | head -c 400
```

Expect JSON starting `{"sheets":{`. If you get HTML, re-check the access setting.

Then confirm the input columns were detected correctly:

```bash
curl -sL "https://script.google.com/macros/s/XXXX/exec?action=structure" \
  | python -c "import json,sys; d=json.load(sys.stdin); [print(n, s.get('input_field_hints')) for n,s in d['sheets'].items()]"
```

For every calculable tab, `width_col`/`height_col` must be the **customer input**
columns — on the Breeze sheets that is `B`/`C` with `header_row: 5`. If you see a
column in the teens or twenties, the tab has multiple Width/Height blocks and
detection picked the wrong one; report it rather than saving the template.

## What changed from the prototype

**1. The material tab name is now a request parameter.**
It was hardcoded to `"Material & Hardware"`. The OP-OP workbook names that tab
`"Profile & Hardwares"`, so no `materialGrid` came back at all and no BOM reached
the ERP. `MATERIAL_SHEET_NAME` stays as the default, so the old prototype
console — which sends no `materialSheetName` — behaves exactly as before.
Requesting a tab that doesn't exist now returns a `warning` instead of silently
omitting the BOM, which downstream looks like "this order needs no material".

**2. `findInputColumns` no longer lets the last matching header win.**

This was a live correctness bug. The function scanned row-major and overwrote its
result on *every* match, so the bottom-most Width/Height pair won. Production
tabs contain several such pairs — customer inputs, then derived cut sizes, sash
sizes, glass sizes, steel sizes. On the real OP-OP sheet, `"Width"` appears at
B5, D5, M5, N5, R5, L24 and N24, and the old code settled on:

```
wNo=K  width=N  height=P  headerRow=24     ← the steel-cutting block
```

so `doPost` wrote customer dimensions into the wrong table and the order
mis-calculated with no error shown. It now works in two stages: within a row the
**leftmost** match for each label wins, and across rows only rows having *both*
width and height are candidates, preferring one with a W.No column and then the
**earliest** — the input block sits above the derived blocks on every sheet
observed.

Verified against all three real workbooks (Fixed, OP-OP V.Cutting, Louver): all
three now detect `A`/`B`/`C` at `header_row 5`.

**3. `doPost` holds a script lock.**
`doPost` mutates shared state — write → flush → read → wipe. Two overlapping
requests interleaved: the first wrote its windows, and while it waited on flush
the second cleared the block and wrote its own, so the first read back the
second's numbers. The lock also covers a person editing the workbook in a browser
tab mid-request, which no amount of queueing on the Aran side can see. On
contention the caller gets a clear "spreadsheet is busy" message rather than
silently wrong numbers.
