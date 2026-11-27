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

Requires Node 22+ and PostgreSQL.

```bash
npm install
docker compose up -d          # local Postgres (or point DATABASE_URL at your own)
cp .env.example .env
npm run dev
```

The web app runs on http://localhost:5173 and the API on port 3001. The schema is created on first start. Open the app and choose **Create an account**.

To build and run the production server, which serves both the app and the API on `PORT`:

```bash
npm run build
npm start
```

## Deploying to Railway

1. Create a project with a **PostgreSQL** database and a service for this repository.
2. On the service, set `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`.
3. Deploy. Railway's builder runs `npm run build` and `npm start`. Under **Settings → Deploy**, set the health-check path to `/api/health`.

No other setup is needed: people open the site and create an account themselves.

## Accounts and workspaces

- Anyone can **sign up** with name, email and password, and gets a private **workspace** straight away.
- Studies, people directories and responses belong to a workspace. Only its members can see them.
- Any member can create an **invite link** under **Team & settings**. Links can be reused for 7 days, the team page shows how often each was used, and they can be turned off at any time. Whoever opens one signs up (or signs in) and joins that workspace.
- Each workspace has one **owner**, who can rename it and remove members. Members can leave.
- If you belong to several workspaces, you switch between them from the account menu.

## Security model

- **Accounts:** email and password (scrypt hashes). Sessions are HttpOnly, Secure, SameSite cookies that expire after 14 days, and the server stores only a hash of each session token. Sign-up and sign-in attempts are rate-limited. Every study request is checked against the caller's workspace.
- **Forms:**
  - Each survey has an unguessable link (`/f/<token>`) that only the server issues.
  - A form endpoint returns just that survey's questions, never the people directory or any responses.
  - Submissions are validated on the server against the survey (options, scales, required and conditional questions, pick-N rules) and rate-limited per IP.
  - A survey can be closed to stop new responses.
- **Privacy notice:** when the study has one, respondents must agree before submitting, and the response records when they agreed.
- **Audit log:** records sign-ups, sign-ins, failed sign-ins, invites, membership changes, study creation and deletion, response changes and exports, each tagged with the workspace.
- **HTTP hardening:** strict Content-Security-Policy and HSTS headers (via helmet). Every state-changing request must carry a custom header, which blocks cross-site form posts.

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
server/                   Express API: auth, studies, public forms, Postgres, audit log
src/api.ts                API client: HTTP, or local storage for the static build
src/auth.tsx              Session, active workspace and route guard
src/types.ts, model.ts    Survey model and helpers
src/exportExcel.ts        Workbook layout and export
src/simulate.ts           Response simulation (anonymous or from the org tree)
src/org.ts                People directory helpers and sample-org generator
src/template.ts           Sample study
src/components/SurveyForm Respondent form (shared validation with the server)
src/pages/, components/   UI
```
