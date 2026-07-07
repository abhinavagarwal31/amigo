import { render, screen } from '@testing-library/react';
import { AnswerCard } from '../src/components/AnswerCard';

function mockSpeechSynthesis() {
  const speak = jest.fn();
  const cancel = jest.fn();
  window.speechSynthesis = { speak, cancel, getVoices: () => [] };
  window.SpeechSynthesisUtterance = function SpeechSynthesisUtterance(text) {
    this.text = text;
  };
  return { speak, cancel };
}

describe('AnswerCard', () => {
  afterEach(() => {
    delete window.speechSynthesis;
    delete window.SpeechSynthesisUtterance;
  });

  test('renders nothing when there is no response yet', () => {
    const { container } = render(<AnswerCard response={null} outputLanguage="en-US" />);
    expect(container).toBeEmptyDOMElement();
  });

  test('renders nothing when the response is an escalation', () => {
    const { container } = render(
      <AnswerCard
        response={{ escalation: true, answer: null, reason: 'x', action: 'y' }}
        outputLanguage="en-US"
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  test('renders answer text, category, and confidence for a grounded response', () => {
    mockSpeechSynthesis();
    render(
      <AnswerCard
        response={{
          answer: 'The nearest accessible restroom is at Section 214 concourse.',
          category: 'GROUNDED_FACT',
          confidence: 'high',
          sourceDocs: [{ text: 'Restroom at Section 214 concourse, wheelchair accessible.' }]
        }}
        outputLanguage="en-US"
      />
    );

    expect(screen.getByText(/The nearest accessible restroom/)).toBeInTheDocument();
    expect(screen.getByText(/GROUNDED_FACT/)).toBeInTheDocument();
    expect(screen.getByText(/high/)).toBeInTheDocument();
  });

  test('shows a low-confidence warning when confidence is low', () => {
    mockSpeechSynthesis();
    render(
      <AnswerCard
        response={{ answer: 'Some answer', category: 'GROUNDED_FACT', confidence: 'low', sourceDocs: [] }}
        outputLanguage="en-US"
      />
    );
    expect(screen.getByText(/Low confidence/)).toBeInTheDocument();
  });

  test('automatically speaks a new answer when speech synthesis is supported', () => {
    const { speak } = mockSpeechSynthesis();
    render(
      <AnswerCard
        response={{
          answer: 'Hello there',
          category: 'GROUNDED_FACT',
          confidence: 'high',
          sourceDocs: []
        }}
        outputLanguage="en-US"
      />
    );
    expect(speak).toHaveBeenCalledTimes(1);
  });
});
