// Fan-facing safety copy, kept separate from the volunteer-facing "reason"/"action"
// fields the backend returns (those are instructions for a volunteer, not a fan
// standing alone at an unattended kiosk). Shared by KioskView's submitQuery (to
// decide what to speak aloud) and EscalationScreen (to render the same text).
const KIOSK_ESCALATION_TEXT = {
  'en-US': {
    heading: 'This may need urgent help',
    body: 'Please find the nearest staff member right away, or use the button below to alert staff.',
    alertButton: 'Alert Nearby Staff',
    alertSent: 'Staff alerted'
  },
  'es-ES': {
    heading: 'Esto puede necesitar ayuda urgente',
    body: 'Por favor busque al miembro del personal más cercano de inmediato, o use el botón de abajo para alertar al personal.',
    alertButton: 'Alertar al personal cercano',
    alertSent: 'Personal alertado'
  },
  'pt-BR': {
    heading: 'Isso pode precisar de ajuda urgente',
    body: 'Por favor, encontre o funcionário mais próximo imediatamente, ou use o botão abaixo para alertar a equipe.',
    alertButton: 'Alertar equipe próxima',
    alertSent: 'Equipe alertada'
  },
  'fr-FR': {
    heading: 'Cela pourrait nécessiter une aide urgente',
    body: 'Veuillez trouver le membre du personnel le plus proche immédiatement, ou utilisez le bouton ci-dessous pour alerter le personnel.',
    alertButton: 'Alerter le personnel à proximité',
    alertSent: 'Personnel alerté'
  },
  'de-DE': {
    heading: 'Dies könnte dringende Hilfe erfordern',
    body: 'Bitte finden Sie sofort das nächste Personal, oder nutzen Sie die Schaltfläche unten, um das Personal zu alarmieren.',
    alertButton: 'Personal in der Nähe alarmieren',
    alertSent: 'Personal alarmiert'
  },
  'it-IT': {
    heading: 'Questo potrebbe richiedere assistenza urgente',
    body: "Per favore trova subito il membro dello staff più vicino, oppure usa il pulsante qui sotto per avvisare lo staff.",
    alertButton: 'Avvisa lo staff vicino',
    alertSent: 'Staff avvisato'
  },
  // Reviewed to the best of non-native confidence, same caveat as the Arabic trigger list
  // in venues.json — worth a native-speaker check before a real deployment.
  'ar-SA': {
    heading: 'قد يتطلب هذا مساعدة عاجلة',
    body: 'يرجى العثور على أقرب موظف فورًا، أو استخدم الزر أدناه لتنبيه الموظفين.',
    alertButton: 'تنبيه الموظفين القريبين',
    alertSent: 'تم تنبيه الموظفين'
  },
  'ja-JP': {
    heading: '緊急の対応が必要な場合があります',
    body: '至急、最寄りのスタッフを見つけるか、下のボタンでスタッフに知らせてください。',
    alertButton: '近くのスタッフに知らせる',
    alertSent: 'スタッフに通知しました'
  }
};

export function getKioskEscalationText(lang) {
  return KIOSK_ESCALATION_TEXT[lang] || KIOSK_ESCALATION_TEXT['en-US'];
}
