import PropTypes from 'prop-types';
import { getLanguageDir } from '../../constants';
import { getKioskEscalationText } from './kioskEscalationText';

export function EscalationScreen({ language, alertSent, onAlertStaff, onReset }) {
  const kioskText = getKioskEscalationText(language);
  return (
    <main className="kiosk kiosk--escalation" role="alert" dir={getLanguageDir(language)}>
      <h1>{kioskText.heading}</h1>
      <p>{kioskText.body}</p>
      <button
        type="button"
        className="kiosk-alert-btn"
        disabled={alertSent}
        onClick={onAlertStaff}
      >
        {alertSent ? kioskText.alertSent : kioskText.alertButton}
      </button>
      <button type="button" className="kiosk-secondary-btn" onClick={onReset}>
        Done
      </button>
    </main>
  );
}

EscalationScreen.propTypes = {
  language: PropTypes.string.isRequired,
  alertSent: PropTypes.bool.isRequired,
  onAlertStaff: PropTypes.func.isRequired,
  onReset: PropTypes.func.isRequired
};
