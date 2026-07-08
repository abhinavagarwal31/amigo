import PropTypes from 'prop-types';
import { getLanguageDir } from '../../constants';

export function RespondingScreen({ response, language, onReset }) {
  return (
    <main className="kiosk kiosk--responding" dir={getLanguageDir(language)}>
      <h1>Answer</h1>
      <p className="kiosk-answer-text">{response && response.answer}</p>
      <button type="button" onClick={onReset}>
        Ask another question
      </button>
    </main>
  );
}

RespondingScreen.propTypes = {
  response: PropTypes.shape({
    answer: PropTypes.string
  }),
  language: PropTypes.string.isRequired,
  onReset: PropTypes.func.isRequired
};
