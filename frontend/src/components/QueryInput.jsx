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
      />
      <button type="submit" disabled={disabled || !value.trim()}>
        Ask
      </button>
    </form>
  );
}
