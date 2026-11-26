# Survey Builder

Build multi-survey questionnaires, collect responses through shareable forms or simulate them, and export everything to a single Excel workbook ready for analysis.

## Features

- **Studies with several surveys.** For example, an employee survey, a manager survey and an account-manager survey are exported together.
- **Question types:** 1–5 agreement scale, custom rating scale, single choice, multiple choice (pick exactly / up to N), yes/no, short and long text, number.
- **Conditional questions:** "show MGR-G5 only if MGR-G4 = Yes".
- **Repeating groups:** questions answered once per item, such as each direct report. Each group is exported as its own long-format sheet, linked back to the respondent.
- **Respondent forms** with validation and a progress indicator.
- **People directory:** an optional org tree with codes, names and reporting lines. You can paste it from a spreadsheet or generate a sample.
- **Simulated responses** for practising your analysis before real data arrive. They can be anonymous, or drawn from the people directory with real names and reporting lines.
- **Excel export** of live responses, simulated responses, both, or a blank template.
- **Printable questionnaire** view.

## Getting started

```bash
npm install
npm run dev
```

The web app runs on http://localhost:5173 and the API on port 3001. Data is stored in `data/db.json`.

To run a single production server that serves both the app and the API on `PORT` (default 3001):

```bash
npm start
```

## Static demo (GitHub Pages)

`npm run build:pages` builds a static version that has no server and keeps data in the browser's local storage. It is deployed automatically from `main` by `.github/workflows/pages.yml`. Responses submitted there stay in that browser, so use the server version to collect responses from other people.

## Export format

| Sheet | Columns |
| --- | --- |
| `README` | Notice, sheet list and response counts |
| One per survey | `DATA_TYPE`, `Response ID`, `Date submitted`, `Respondent name` (named responses only), then one column per question code |
| One per repeating group | `DATA_TYPE`, parent code / name, item code / name, then one column per question |
| `ORG` (if people exist) | Employee code, name, manager code and name, division, band, category, role |

- Scale and number answers are written as numbers. Multiple-choice answers are joined with `; `.
- Answers skipped by conditional logic are left blank.
- `DATA_TYPE` is `LIVE` for real submissions and `SIMULATED` for generated rows.

## Project structure

```
server/index.js           JSON-file API (studies, responses)
src/api.ts                API client: HTTP, or local storage for the static build
src/types.ts, model.ts    Survey model and helpers
src/exportExcel.ts        Workbook layout and export
src/simulate.ts           Response simulation (anonymous or from the org tree)
src/org.ts                People directory helpers and sample-org generator
src/template.ts           Sample study
src/pages/, components/   UI
```
