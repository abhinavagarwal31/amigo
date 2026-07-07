import { render, screen, fireEvent, act } from '@testing-library/react';
import { VoiceInputButton } from '../src/components/VoiceInputButton';

class FakeSpeechRecognition {
  constructor() {
    FakeSpeechRecognition.instances.push(this);
    this.lang = '';
    this.interimResults = false;
    this.maxAlternatives = 1;
    this.start = jest.fn();
    this.stop = jest.fn(() => {
      if (this.onend) this.onend();
    });
  }
}
FakeSpeechRecognition.instances = [];

describe('VoiceInputButton', () => {
  beforeEach(() => {
    FakeSpeechRecognition.instances = [];
    window.SpeechRecognition = FakeSpeechRecognition;
  });

  afterEach(() => {
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
  });

  test('renders nothing when SpeechRecognition is unsupported, leaving text input as the only path', () => {
    delete window.SpeechRecognition;
    const { container } = render(
      <VoiceInputButton lang="en-US" onTranscript={jest.fn()} disabled={false} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  test('starts listening and wires onresult to the same submit path via onTranscript', () => {
    const onTranscript = jest.fn();
    render(<VoiceInputButton lang="en-US" onTranscript={onTranscript} disabled={false} />);

    fireEvent.click(screen.getByRole('button', { name: /speak your question/i }));

    const instance = FakeSpeechRecognition.instances[0];
    expect(instance.start).toHaveBeenCalledTimes(1);
    expect(instance.lang).toBe('en-US');

    act(() => {
      instance.onresult({ results: [[{ transcript: 'where is the restroom' }]] });
    });

    expect(onTranscript).toHaveBeenCalledWith('where is the restroom');
  });

  test('falls back gracefully and shows an error on recognition error', () => {
    render(<VoiceInputButton lang="en-US" onTranscript={jest.fn()} disabled={false} />);
    fireEvent.click(screen.getByRole('button', { name: /speak your question/i }));

    const instance = FakeSpeechRecognition.instances[0];
    act(() => {
      instance.onerror(new Event('error'));
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/voice input failed/i);
  });

  test('stops listening when clicked again while already listening', () => {
    render(<VoiceInputButton lang="en-US" onTranscript={jest.fn()} disabled={false} />);
    fireEvent.click(screen.getByRole('button', { name: /speak your question/i }));

    const instance = FakeSpeechRecognition.instances[0];
    expect(screen.getByRole('button', { name: /stop listening/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /stop listening/i }));
    expect(instance.stop).toHaveBeenCalledTimes(1);
  });
});
