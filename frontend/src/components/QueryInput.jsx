import PropTypes from 'prop-types';

export function QueryInput({ value, onChange, onSubmit, disabled }) {
  const handleSubmit = (event) => {
    event.preventDefault();
    if (!value.trim()) return;
    onSubmit();
  };

  return (
    <form onSubmit={handleSubmit} className="query-input-form">
      <label htmlFor="query-text">Type your question</label>
      <textarea
        id="query-text"
        name="query"
        rows={3}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder="e.g. Where is the nearest wheelchair accessible restroom?"
      />
      <button type="submit" className="ask-btn" disabled={disabled || !value.trim()}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
        <span>Ask</span>
      </button>
    </form>
  );
}

QueryInput.propTypes = {
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  disabled: PropTypes.bool
};
