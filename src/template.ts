// Sample study (VERIZE Workforce Study) used as an editable starting point: four surveys covering every question type.
import { uid } from './model';
import type { Question, QType, Section, Study, Survey } from './types';

type QSpec = [code: string, text: string, type: QType, extra?: Partial<Question>];

const q = ([code, text, type, extra]: QSpec): Question => ({
  id: uid(),
  code,
  text,
  type,
  options: [],
  required: true,
  ...(type === 'multi' ? { pickCount: 3, pickExact: true } : {}),
  ...extra,
});

const sec = (title: string, letter: string, specs: QSpec[], extra?: Partial<Section>): Section => ({
  id: uid(),
  title,
  letter,
  kind: 'standard',
  questions: specs.map(q),
  ...extra,
});

const L = 'likert' as const;
const YN = 'yesno' as const;
const opts = (...o: string[]) => ({ options: o });
const DIVISIONS = ['Division 1', 'Division 2', 'Division 3', 'Division 4', 'Division 5', 'Corporate / support'];

const emp: Survey = {
  id: uid(),
  code: 'EMP',
  sheetName: 'EMP',
  title: 'Employee career & engagement survey',
  audience: 'All employees',
  description: '',
  sections: [
    sec('Profile', 'P', [
      ['EMP-P1', 'Which division / function do you work in?', 'single', { ...opts(...DIVISIONS), helpText: 'Replace with the division & function list from HRIS.' }],
      ['EMP-P2', 'What is your grade band?', 'single', { ...opts('Band 1', 'Band 2', 'Band 3', 'Band 4', 'Band 5'), helpText: 'Replace with the band list from HRIS.' }],
      ['EMP-P3', 'How long have you been with VERIZE?', 'single', opts('Less than 1 yr', '1-3 yrs', '3-5 yrs', '5-10 yrs', 'More than 10 yrs')],
      ['EMP-P4', 'Which workforce category do you belong to?', 'single', opts('Technical / Engineering', 'Sales', 'Support', 'Management')],
      ['EMP-P5', 'Employee code (used only to link your answers to HR records; results are reported for groups of 5 or more, never individually)', 'text'],
    ]),
    sec('Engagement', 'E', [
      ['EMP-E1', 'I am proud to work for VERIZE.', L],
      ['EMP-E2', 'I would recommend VERIZE to a friend as a place to work.', L],
      ['EMP-E3', 'I see myself working at VERIZE two years from now.', L],
      ['EMP-E4', 'My work gives me a sense of accomplishment.', L],
      ['EMP-E5', 'Good work is recognised at VERIZE.', L],
      ['EMP-E6', 'How likely are you to actively look for a job outside VERIZE in the next 12 months?', 'scale', { scaleMin: 1, scaleMax: 5, scaleLabels: { '1': 'Very unlikely', '5': 'Very likely' } }],
    ]),
    sec('Career', 'C', [
      ['EMP-C1', 'I know what my next career step at VERIZE could be.', L],
      ['EMP-C2', 'In the last 24 months, have you discussed a documented career path with your manager?', YN],
      ['EMP-C3', 'I know how to find and apply for internal job openings.', L],
      ['EMP-C4', 'In the last 24 months, have you applied for an internal role?', YN],
      ['EMP-C5', 'In the last 24 months, have you been promoted or moved to a new role inside VERIZE?', YN],
      ['EMP-C6', 'How many training days have you attended in the last 12 months?', 'single', opts('0', '1-2', '3-5', '6-10', 'More than 10')],
      ['EMP-C7', 'The training I received is relevant to the work I will do in the next 3 years.', L],
      ['EMP-C8', 'Which THREE of these would most improve your career growth here? (pick 3)', 'multi', opts('Job rotation', 'Internal job postings', 'Mentoring', 'Clear career-path framework', 'Cross-skilling programmes', 'Clear promotion criteria', 'Stretch assignments', 'Leadership programmes')],
    ]),
    sec('Manager support', 'M', [
      ['EMP-M1', 'My manager discusses my development with me regularly.', L],
      ['EMP-M2', 'My manager gives me useful feedback.', L],
      ['EMP-M3', 'My manager would support me moving to another team.', L],
      ['EMP-M4', 'I can raise concerns with my manager without fear.', L],
      ['EMP-M5', 'Has your reporting manager changed in the last 12 months?', YN],
    ]),
    sec('Skills & readiness', 'S', [
      ['EMP-S1', 'I have the skills needed to perform my current role well.', L],
      ['EMP-S2', 'I am confident I can build the skills my role will need by 2030.', L],
      ['EMP-S3', 'My project assignments make good use of my skills.', L],
      ['EMP-S4', 'I am willing to learn a new skill or move to a new role if VERIZE supports me.', L],
    ]),
    sec('Retention', 'R', [
      ['EMP-R1', 'Which THREE reasons would most likely make someone like you leave VERIZE? (pick 3)', 'multi', opts('Pay', 'Career growth', 'Manager', 'Workload', 'Recognition', 'Learning opportunities', 'Work location', 'Job security', 'Better external offer', 'Other')],
      ['EMP-R2', 'Anything else you want leadership to know? (optional)', 'longtext', { required: false }],
    ]),
  ],
};

const mgr: Survey = {
  id: uid(),
  code: 'MGR',
  sheetName: 'MGR',
  title: 'Manager survey',
  audience: 'All people managers',
  description: '',
  sections: [
    sec('Profile', 'P', [
      ['MGR-P1', 'Your division / function', 'single', { ...opts(...DIVISIONS), helpText: 'Replace with the division & function list from HRIS.' }],
      ['MGR-P2', 'Number of direct reports', 'number', { min: 0 }],
      ['MGR-P3', 'Years as a people manager', 'number', { min: 0 }],
      ['MGR-P4', 'Manager employee code (linking only)', 'text'],
    ]),
    sec('Accountability', 'G', [
      ['MGR-G1', 'Every action from our review meetings has a named owner and a due date.', L],
      ['MGR-G2', 'Issues that need escalation are escalated within the prescribed time.', L],
      ['MGR-G3', 'After a corrective action is taken, someone checks that it actually worked.', L],
      ['MGR-G4', 'In the last 12 months, has the same performance, compliance or audit issue recurred in your area?', YN],
      ['MGR-G5', 'If yes: what is the MAIN reason it recurred?', 'single', { ...opts('Unclear ownership', 'No follow-up', 'No time', 'No authority to act', 'Unclear policy', 'Skill gap', 'Other'), showIf: { code: 'MGR-G4', equals: 'Yes' } }],
      ['MGR-G6', 'In my area it is clear who approves what (decision rights).', L],
    ]),
    sec('Deployment & readiness', 'D', [
      ['MGR-D1', 'What share of your team is deployed on work that matches their skills?', 'single', opts('Less than 25%', '25-50%', '50-75%', 'More than 75%')],
      ['MGR-D2', 'Training attended by my team in the last 12 months has improved their work.', L],
      ['MGR-D3', 'Which skills are hardest to find or build for your team? (up to 3)', 'text', { helpText: 'Separate skills with a semicolon (;).' }],
      ['MGR-D4', 'How many critical roles in your team have a ready-now successor?', 'number', { min: 0 }],
      ['MGR-D5', 'How many months does a new hire typically take to become fully productive?', 'number', { min: 0 }],
    ]),
    sec(
      'Team assessment',
      'T',
      [
        ['MGR-T0', 'Is this a critical role?', YN, { exportHeader: 'Critical role? (Yes/No)' }],
        ['MGR-T1', 'Readiness', 'single', { ...opts('Ready now', 'Ready in 6-12 months', 'Not ready'), exportHeader: 'Readiness' }],
        ['MGR-T2', 'Proficiency in their most critical skill vs required level', 'scale', { scaleMin: 1, scaleMax: 5, scaleLabels: { '1': 'Far below', '3': 'Meets', '5': 'Exceeds' }, exportHeader: 'Proficiency vs required (1-5)' }],
        ['MGR-T3', 'How relevant is their current project work to their skills', 'scale', { scaleMin: 1, scaleMax: 5, scaleLabels: { '1': 'Not relevant', '5': 'Highly relevant' }, exportHeader: 'Project relevance (1-5)' }],
        ['MGR-T4', 'Your view of flight risk in next 12 months', 'single', { ...opts('Low', 'Medium', 'High'), exportHeader: 'Flight risk next 12 months' }],
      ],
      {
        kind: 'roster',
        roster: {
          sheetName: 'MGR_TEAM',
          parentKeyCode: 'MGR-P4',
          parentKeyHeader: 'Manager code',
          itemKeyHeader: 'Employee code (direct report)',
          itemLabel: 'direct report',
        },
      },
    ),
  ],
};

const am: Survey = {
  id: uid(),
  code: 'AM',
  sheetName: 'AM',
  title: 'Account manager survey',
  audience: 'All account managers',
  description: '',
  sections: [
    sec('Profile', 'P', [
      ['AM-P1', 'Your division', 'single', { ...opts(...DIVISIONS.slice(0, 5)), helpText: 'Replace with the division list.' }],
      ['AM-P2', 'Years in sales / account management', 'number', { min: 0 }],
      ['AM-P3', 'Number of active accounts you manage', 'number', { min: 0 }],
      ['AM-P4', 'Account manager name / code (linking to CRM and incentive plan only)', 'text'],
    ]),
    sec('Ownership', 'A', [
      ['AM-A1', 'For each of my accounts it is clear who owns the customer relationship.', L],
      ['AM-A2', 'In the last 12 months, for how many of your accounts was ownership disputed between divisions?', 'number', { min: 0 }],
    ]),
    sec('Incentives', 'A', [
      ['AM-A3', "My incentive rewards me for selling other divisions' services.", L],
      ['AM-A4', 'If I bring in a sale for another division, I get credit in my targets / incentive.', 'single', opts('Yes', 'Partly', 'No', 'Not sure')],
      ['AM-A5', 'My targets are set only for my own division.', L],
    ]),
    sec('Collaboration', 'A', [
      ['AM-A6', 'I know whom to contact in other divisions for a joint opportunity.', L],
      ['AM-A7', 'How many joint opportunities with another division did you work on in the last 12 months?', 'number', { min: 0 }],
      ['AM-A8', 'Collaboration between divisions is good.', L],
      ['AM-A9', 'I have enough time to explore cross-division opportunities.', L],
    ]),
    sec('Barriers', 'A', [
      ['AM-A10', 'Which THREE are the biggest barriers to cross-selling? (pick 3)', 'multi', opts('Incentive design', 'Ownership conflicts', "Limited knowledge of other divisions' offerings", 'No joint planning forum', 'Customer does not need it', 'Internal competition', 'Not enough time', 'No CRM visibility')],
    ]),
  ],
};

const exp: Survey = {
  id: uid(),
  code: 'EXP',
  sheetName: 'EXP',
  title: 'Leadership / expert panel',
  audience: 'Leadership',
  description:
    'Complete the four tabs (EXP_Outlook, EXP_Skills, EXP_Levers, EXP_Roles) in VERIZE_Survey_Pack.xlsx. Give low / base / high values and the basis for each estimate. A 30-minute calibration meeting follows.',
  sections: [],
};

export function sampleStudyTemplate(): Omit<Study, 'id'> {
  return {
    title: 'VERIZE Workforce Study - Survey Questionnaires',
    intro:
      'Confidential. Takes about 8 minutes. Results are reported only for groups of five or more people. Please answer for yourself. There are no right or wrong answers.',
    readmeNotes: '',
    surveys: [emp, mgr, am, exp].map((s) => structuredClone(s)),
  };
}
