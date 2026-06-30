/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Flashcard {
  front: string;
  back: string;
}

export interface Mnemonic {
  front: string;
  back: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  selectedAnswer?: string;
}

export interface StudySprint {
  flashcards: Flashcard[];
  mnemonics: Mnemonic[];
  quiz: QuizQuestion[];
}

export interface SprintRecord {
  id: string;
  userId: string;
  userEmail: string;
  notesTopic: string;
  scorePoints: number;
  totalMetricsCount: number;
  accuracyPercentage: number;
  rawWorkspacePayload: StudySprint;
  loggedTimestamp: any;
}
