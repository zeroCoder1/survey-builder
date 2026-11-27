import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, formsApi, type PublicForm } from '../api';
import SurveyForm from '../components/SurveyForm';
import type { Study } from '../types';

const Message = ({ text }: { text: string }) => (
  <div className="take">
    <div className="card center-text">{text}</div>
  </div>
);

/** Public form opened from a link such as /f/<token> (server build). */
export function PublicSurvey() {
  const { token } = useParams();
  const [form, setForm] = useState<PublicForm | null>(null);
  const [failed, setFailed] = useState('');

  useEffect(() => {
    formsApi
      .get(token!)
      .then((f) => {
        setForm(f);
        document.title = f.survey.title;
      })
      .catch((e: Error) => setFailed(e.message || 'This survey could not be loaded.'));
  }, [token]);

  if (failed) return <Message text={failed} />;
  if (!form) return <div className="take muted">Loading…</div>;
  return (
    <SurveyForm
      studyTitle={form.study.title}
      intro={form.study.intro}
      consentText={form.study.consentText}
      survey={form.survey}
      accepting={form.accepting}
      onSubmit={async (payload) => (await formsApi.submit(token!, payload)).responseId}
    />
  );
}

/** Form addressed by study and survey id (static build, where everything lives in this browser). */
export function LocalSurvey() {
  const { studyId, surveyId } = useParams();
  const [study, setStudy] = useState<Study | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api.getStudy(studyId!).then(setStudy).catch(() => setFailed(true));
  }, [studyId]);

  const survey = study?.surveys.find((s) => s.id === surveyId);
  if (failed || (study && !survey)) return <Message text="This survey could not be found." />;
  if (!study || !survey) return <div className="take muted">Loading…</div>;
  return (
    <SurveyForm
      studyTitle={study.title}
      intro={study.intro}
      consentText={study.consentText}
      survey={survey}
      accepting={survey.acceptingResponses !== false}
      onSubmit={async ({ answers, roster }) => {
        const [r] = await api.submitResponse(study.id, { surveyId: survey.id, answers, roster, dataType: 'LIVE' });
        return r.responseId;
      }}
    />
  );
}
