import PropTypes from 'prop-types';

export function RespondingErrorScreen({ error, onReset }) {
  return (
    <main className="kiosk kiosk--responding">
      <p role="alert">{error}</p>
      <button type="button" onClick={onReset}>
        Ask another question
      </button>
    </main>
  );
}

RespondingErrorScreen.propTypes = {
  error: PropTypes.string.isRequired,
  onReset: PropTypes.func.isRequired
};
