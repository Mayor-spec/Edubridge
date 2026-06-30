/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
  signInWithPopup,
  User
} from "firebase/auth";
import {
  collection,
  addDoc,
  setDoc,
  doc,
  getDocs,
  query,
  where,
  serverTimestamp
} from "firebase/firestore";
import {
  BookOpen,
  Sparkles,
  UploadCloud,
  CheckCircle2,
  XCircle,
  RotateCw,
  History,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Plus,
  ArrowRight,
  AlertCircle,
  Calendar,
  Award,
  Check,
  FileText,
  User as UserIcon,
  Menu,
  FileCheck
} from "lucide-react";
import { auth, db, googleProvider, handleFirestoreError, OperationType } from "./firebase";
import { Flashcard, Mnemonic, QuizQuestion, StudySprint, SprintRecord } from "./types";

const SAMPLE_NOTES = `-- HIGH-YIELD STUDY SESSION: CARDIAC ACTION POTENTIAL --

Phase 0: Depolarization
Rapid influx of sodium (Na+) ions through fast voltage-gated Na+ channels. The cellular voltage rises dramatically from -90mV to +20mV. This phase corresponds closely to the QRS complex on an electrocardiogram (ECG).

Phase 1: Initial Repolarization
Inactivation of fast sodium channels. A transient outward efflux of potassium (K+) ions occurs, creating a brief downward notch in the membrane potential graph.

Phase 2: Plateau Phase
A balanced state of inward calcium (Ca2+) influx through L-type Ca2+ channels and outward potassium (K+) efflux. This prolongs the refractory period, allowing the heart to fill and preventing muscle tetany. Corresponds to the ST segment on an ECG.

Phase 3: Rapid Repolarization
Closure of the L-type calcium channels. Heavy efflux of potassium (K+) ions through rapid delayed rectifier K+ channels occurs, returning the membrane potential to its resting state of -90mV. Corresponds to the T wave on an ECG.

Phase 4: Resting Potential
Stable resting membrane potential maintained primarily by the Na+/K+ ATPase pump and leak potassium channels. The cellular potential is held steady at -90mV until the next excitation wave.`;

export default function App() {
  // Authentication states
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authFirstName, setAuthFirstName] = useState("");
  const [authLastName, setAuthLastName] = useState("");
  const [authError, setAuthError] = useState("");

  // Sidebar responsive drawer state
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Study Dashboard States
  const [notesInput, setNotesInput] = useState(SAMPLE_NOTES);
  const [quizCount, setQuizCount] = useState("5");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // History state
  const [historyRecords, setHistoryRecords] = useState<SprintRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);

  // Active workspace states
  const [sprintLoaded, setSprintLoaded] = useState(false);
  const [activeSprint, setActiveSprint] = useState<StudySprint | null>(null);
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [reviewModeTitle, setReviewModeTitle] = useState("");

  // Flashcard interaction
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isCardFlipped, setIsCardFlipped] = useState(false);

  // Mnemonic interaction
  const [currentMnemonicIndex, setCurrentMnemonicIndex] = useState(0);
  const [isMnemonicFlipped, setIsMnemonicFlipped] = useState(false);

  // Quiz interactive scoring states
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [addingQuestions, setAddingQuestions] = useState(false);

  // Auth State Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthLoading(false);
      if (user) {
        fetchHistory(user.uid);
      } else {
        setHistoryRecords([]);
        resetSprintWorkspace();
      }
    });
    return unsubscribe;
  }, []);

  // Fetch past sprint history from Firestore
  const fetchHistory = async (userId: string) => {
    setLoadingHistory(true);
    const path = "student_performance_records";
    try {
      const q = query(
        collection(db, path),
        where("userId", "==", userId)
      );
      const snapshot = await getDocs(q);
      const records: SprintRecord[] = [];
      snapshot.forEach((doc) => {
        records.push({ id: doc.id, ...doc.data() } as SprintRecord);
      });

      // Sort client-side by loggedTimestamp desc
      records.sort((a, b) => {
        const timeA = a.loggedTimestamp?.seconds || 0;
        const timeB = b.loggedTimestamp?.seconds || 0;
        return timeB - timeA;
      });

      setHistoryRecords(records);
    } catch (err: any) {
      console.error("History fetch error:", err);
      handleFirestoreError(err, OperationType.LIST, path);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Sign Up Handler
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    if (!authFirstName || !authLastName || !authEmail || !authPassword) {
      setAuthError("Please fill in all account parameters.");
      return;
    }
    if (authPassword.length < 6) {
      setAuthError("Password must be at least 6 characters.");
      return;
    }

    try {
      const userCred = await createUserWithEmailAndPassword(auth, authEmail, authPassword);
      await updateProfile(userCred.user, {
        displayName: `${authFirstName} ${authLastName}`
      });
      setCurrentUser({ ...auth.currentUser } as User);
    } catch (err: any) {
      setAuthError(err.message || "Failed to create account.");
    }
  };

  // Sign In Handler
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    if (!authEmail || !authPassword) {
      setAuthError("Please fill in all credentials.");
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, authEmail, authPassword);
    } catch (err: any) {
      setAuthError(err.message || "Authentication failed. Check credentials.");
    }
  };

  // Google Sign In Handler
  const handleGoogleSignIn = async () => {
    setAuthError("");
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      setAuthError(err.message || "Google Sign-In was cancelled or failed.");
    }
  };

  // Logout Handler
  const handleLogout = async () => {
    try {
      await signOut(auth);
      resetSprintWorkspace();
    } catch (err: any) {
      alert("Logout failed: " + err.message);
    }
  };

  // File parsing client-side logic
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setLoadingStatus("Extracting lecture materials...");
    setErrorMessage("");

    try {
      const extension = file.name.split(".").pop()?.toLowerCase();
      const arrayBuffer = await file.arrayBuffer();
      let text = "";

      if (extension === "pdf") {
        const pdfjsLib = (window as any)["pdfjs-dist/build/pdf"];
        if (!pdfjsLib) throw new Error("PDF parser is still loading. Please try again.");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js";
        
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          text += content.items.map((item: any) => item.str).join(" ") + "\n";
        }
      } else if (extension === "docx") {
        const mammoth = (window as any).mammoth;
        if (!mammoth) throw new Error("Word document parser is still loading. Please try again.");
        const result = await mammoth.extractRawText({ arrayBuffer });
        text = result.value;
      } else if (extension === "pptx") {
        const JSZip = (window as any).JSZip;
        if (!JSZip) throw new Error("Presentation parser is still loading. Please try again.");
        const zip = await JSZip.loadAsync(file);
        const slideFiles = Object.keys(zip.files).filter(name => name.startsWith("ppt/slides/slide"));
        for (let slideFile of slideFiles) {
          const slideXml = await zip.files[slideFile].async("text");
          const matches = slideXml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g);
          if (matches) {
            text += matches.map(val => val.replace(/<[^>]*>/g, "")).join(" ") + "\n";
          }
        }
      } else {
        throw new Error("Unsupported format. Please upload a .pdf, .docx, or .pptx file.");
      }

      if (text.trim()) {
        setNotesInput(text.trim());
        setLoadingStatus("Extraction successful!");
        setTimeout(() => setLoadingStatus(""), 1500);
      } else {
        throw new Error("No readable text could be extracted from this document.");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to process lecture file.");
    } finally {
      setIsLoading(false);
    }
  };

  // Generate study sprint pipeline from server proxy
  const generateStudySprint = async () => {
    if (!notesInput.trim()) {
      setErrorMessage("Please input study notes or upload lecture materials first!");
      return;
    }

    setIsLoading(true);
    setErrorMessage("");
    setLoadingStatus("⚡ Analysing notes...");

    let loadState = 0;
    const loadingMessages = [
      "⚡ Analysing notes structures...",
      "🧠 Forging acrostic mnemonics...",
      "📝 Generating active assessment quiz...",
      "🎨 Polishing study dashboard boards..."
    ];

    const interval = setInterval(() => {
      if (loadState < loadingMessages.length - 1) {
        loadState++;
        setLoadingStatus(loadingMessages[loadState]);
      }
    }, 2200);

    try {
      const res = await fetch("/api/generate-sprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notesText: notesInput,
          quizCount: quizCount
        })
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || "Server failed to process materials.");
      }

      const sprintData: StudySprint = await res.json();
      const initialQuestions = sprintData.quiz.map(q => ({ ...q, selectedAnswer: undefined }));

      setActiveSprint(sprintData);
      setQuizQuestions(initialQuestions);
      setAnsweredCount(0);
      setCorrectCount(0);
      setCurrentCardIndex(0);
      setCurrentMnemonicIndex(0);
      setIsCardFlipped(false);
      setIsMnemonicFlipped(false);
      setIsReviewMode(false);
      setSprintLoaded(true);
      setActiveRecordId(null);

      if (currentUser) {
        await saveSprintRecord(sprintData, initialQuestions, 0, initialQuestions.length, null);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Could not generate study sprint. Please try again.");
    } finally {
      clearInterval(interval);
      setIsLoading(false);
      setLoadingStatus("");
    }
  };

  // Dynamic quiz expansion calling backend route
  const handleAddMoreQuestions = async () => {
    if (!activeSprint || !notesInput.trim()) return;
    setAddingQuestions(true);
    try {
      const res = await fetch("/api/generate-more-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notesText: notesInput })
      });

      if (!res.ok) throw new Error("Failed to load more questions.");

      const data = await res.json();
      const newQuestions: QuizQuestion[] = data.quiz || [];

      setQuizQuestions(prev => [...prev, ...newQuestions]);

      if (activeSprint) {
        activeSprint.quiz = [...activeSprint.quiz, ...newQuestions];
      }
    } catch (err: any) {
      alert("⚠️ Could not load extra questions: " + err.message);
    } finally {
      setAddingQuestions(false);
    }
  };

  // Handle option click in quiz
  const handleOptionSelect = (qIndex: number, option: string) => {
    const updated = [...quizQuestions];
    if (updated[qIndex].selectedAnswer) return;

    updated[qIndex].selectedAnswer = option;
    setQuizQuestions(updated);

    const isCorrect = option === updated[qIndex].correctAnswer;
    const nextCorrectCount = isCorrect ? correctCount + 1 : correctCount;
    if (isCorrect) {
      setCorrectCount(prev => prev + 1);
    }
    const nextAnsweredCount = answeredCount + 1;
    setAnsweredCount(nextAnsweredCount);

    if (nextAnsweredCount === quizQuestions.length && !isReviewMode && currentUser && activeSprint) {
      saveSprintRecord(activeSprint, updated, nextCorrectCount, quizQuestions.length);
    }
  };

  // Automatically submit record to Firestore when quiz is fully completed (fallback)
  useEffect(() => {
    if (quizQuestions.length > 0 && answeredCount === quizQuestions.length && !isReviewMode && currentUser && activeSprint) {
      saveSprintRecord();
    }
  }, [answeredCount, quizQuestions.length]);

  const sanitizeFirestoreData = (obj: any): any => {
    if (obj === null || obj === undefined) {
      return null;
    }
    // Leave special Firestore types (like FieldValue, serverTimestamp, dates) untouched
    if (typeof obj === "object") {
      const proto = Object.getPrototypeOf(obj);
      if (proto !== null && proto !== Object.prototype && !Array.isArray(obj)) {
        return obj;
      }
    }
    if (Array.isArray(obj)) {
      return obj.map(item => sanitizeFirestoreData(item));
    }
    if (typeof obj === "object") {
      const cleaned: any = {};
      for (const key of Object.keys(obj)) {
        const val = obj[key];
        if (val !== undefined) {
          cleaned[key] = sanitizeFirestoreData(val);
        }
      }
      return cleaned;
    }
    return obj;
  };

  const saveSprintRecord = async (
    sprintToSave?: StudySprint,
    quizToSave?: QuizQuestion[],
    scoreVal?: number,
    totalVal?: number,
    recordIdToUse?: string | null
  ) => {
    if (!currentUser) return;
    const sprint = sprintToSave || activeSprint;
    const quiz = quizToSave || quizQuestions;
    if (!sprint) return;

    const path = "student_performance_records";
    try {
      const rawTopic = (notesInput || "").substring(0, 40).replace(/\n/g, " ") + "...";
      
      const score = typeof scoreVal === "number" && !isNaN(scoreVal) 
        ? scoreVal 
        : (typeof correctCount === "number" && !isNaN(correctCount) ? correctCount : 0);
        
      const total = typeof totalVal === "number" && !isNaN(totalVal) 
        ? totalVal 
        : (quiz && typeof quiz.length === "number" && !isNaN(quiz.length) ? quiz.length : 0);
        
      const accuracy = total > 0 ? Math.round((score / total) * 100) : 0;

      const recordData = {
        userId: currentUser.uid,
        userEmail: currentUser.email || "",
        notesTopic: rawTopic,
        scorePoints: score,
        totalMetricsCount: total,
        accuracyPercentage: accuracy,
        rawWorkspacePayload: {
          flashcards: sprint.flashcards,
          mnemonics: sprint.mnemonics,
          quiz: quiz
        },
        loggedTimestamp: serverTimestamp()
      };

      const cleanedData = sanitizeFirestoreData(recordData);
      const currentRecordId = recordIdToUse !== undefined ? recordIdToUse : activeRecordId;

      if (currentRecordId) {
        await setDoc(doc(db, path, currentRecordId), cleanedData);
      } else {
        const docRef = await addDoc(collection(db, path), cleanedData);
        setActiveRecordId(docRef.id);
      }
      fetchHistory(currentUser.uid);
    } catch (err: any) {
      console.error("Failed to log sprint score:", err);
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  };

  // Load a historical sprint record from dashboard feed
  const handleLoadHistoryRecord = (record: SprintRecord) => {
    const payload = record.rawWorkspacePayload;
    if (!payload) {
      alert("Could not load payload snapshot.");
      return;
    }

    setActiveSprint(payload);
    setQuizQuestions(payload.quiz || []);
    
    const answered = (payload.quiz || []).filter(q => q.selectedAnswer !== undefined).length;
    setAnsweredCount(answered || (payload.quiz || []).length);
    setCorrectCount(record.scorePoints);
    setCurrentCardIndex(0);
    setCurrentMnemonicIndex(0);
    setIsCardFlipped(false);
    setIsMnemonicFlipped(false);
    setReviewModeTitle(record.notesTopic);
    setIsReviewMode(true);
    setSprintLoaded(true);
    setActiveRecordId(record.id);
    setIsSidebarOpen(false); // Close mobile drawer if open
  };

  const resetSprintWorkspace = () => {
    setSprintLoaded(false);
    setActiveSprint(null);
    setQuizQuestions([]);
    setAnsweredCount(0);
    setCorrectCount(0);
    setIsReviewMode(false);
    setActiveRecordId(null);
  };

  // Helper to format text removing raw markdown asterisks and unhandled HTML line breaks beautifully
  const renderFormattedText = (text: string, textClass: string = "text-xs") => {
    if (!text) return null;
    
    // Unescape common HTML escaping from Gemini API
    let cleaned = text
      .replace(/&lt;br\s*\/?&gt;/gi, "<br/>")
      .replace(/&lt;strong&gt;/gi, "<strong>")
      .replace(/&lt;\/strong&gt;/gi, "</strong>");

    // Replace markdown bold **text** with HTML <strong>text</strong>
    cleaned = cleaned.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

    // Replace markdown italic *text* with <em>text</em>
    cleaned = cleaned.replace(/\*(.*?)\*/g, "<em>$1</em>");

    // Split by break tags or newlines
    const lines = cleaned.split(/<br\s*\/?>|\n/i);
    
    const formattedLines = lines.map((line) => {
      let trimmed = line.trim();
      // Remove leading bullet characters
      if (trimmed.startsWith("*") || trimmed.startsWith("-") || trimmed.startsWith("•")) {
        trimmed = trimmed.replace(/^[\*\-\•]\s*/, "");
      }
      return trimmed;
    }).filter(line => line.length > 0);

    return (
      <div className="space-y-1.5 w-full">
        {formattedLines.map((line, idx) => (
          <div 
            key={idx} 
            className={`text-slate-700 ${textClass} leading-relaxed font-medium`}
            dangerouslySetInnerHTML={{ __html: line }}
          />
        ))}
      </div>
    );
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6">
        <div className="flex flex-col items-center space-y-4">
          <RotateCw className="w-10 h-10 text-[#6366F1] animate-spin" />
          <p className="font-display font-medium text-[#1E293B] text-sm">Initializing EduBridge AI...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1E293B] selection:bg-indigo-500/10 antialiased font-sans">
      
      {!currentUser ? (
        /* AUTHENTICATION SCREEN - CLEAN PROFESSIONAL CARD */
        <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-[#F8FAFC] via-[#F8FAFC] to-[#EEF2FF]">
          <div className="max-w-md w-full bg-white border border-[#E2E8F0] rounded-2xl p-8 shadow-sm">
            
            {/* Logo details */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-gradient-to-br from-[#6366F1] to-[#4F46E5] rounded-lg flex items-center justify-center text-white font-bold text-lg">E</div>
                <span className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-[#6366F1] to-[#EC4899] bg-clip-text text-transparent">EduBridge AI</span>
              </div>
              <h2 className="font-display font-bold text-2xl text-[#1E293B]">Complete Study Dashboard</h2>
              <p className="text-[#64748B] text-xs mt-1.5 leading-relaxed">Synthesize textbooks and medical outlines into active recall sprint workflows.</p>
            </div>

            {/* Selector tabs */}
            <div className="grid grid-cols-2 p-1 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl mb-6">
              <button
                type="button"
                onClick={() => { setIsSignUpMode(false); setAuthError(""); }}
                className={`py-2 text-xs font-bold rounded-lg transition-all ${!isSignUpMode ? "bg-white text-[#6366F1] shadow-sm border border-slate-100" : "text-[#64748B] hover:text-[#1E293B]"}`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setIsSignUpMode(true); setAuthError(""); }}
                className={`py-2 text-xs font-bold rounded-lg transition-all ${isSignUpMode ? "bg-white text-[#6366F1] shadow-sm border border-slate-100" : "text-[#64748B] hover:text-[#1E293B]"}`}
              >
                Register
              </button>
            </div>

            {authError && (
              <div className="mb-5 p-3.5 bg-red-50 border-l-4 border-red-500 text-red-700 text-xs font-medium rounded-r-lg flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <span>{authError}</span>
              </div>
            )}

            <form onSubmit={isSignUpMode ? handleSignUp : handleSignIn} className="space-y-4">
              {isSignUpMode && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-[#64748B] uppercase tracking-wide mb-1.5">First Name</label>
                    <input
                      type="text"
                      value={authFirstName}
                      onChange={(e) => setAuthFirstName(e.target.value)}
                      placeholder="Mayowa"
                      className="w-full px-4 py-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-xs focus:outline-none focus:border-[#6366F1] focus:ring-1 focus:ring-[#6366F1]"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#64748B] uppercase tracking-wide mb-1.5">Last Name</label>
                    <input
                      type="text"
                      value={authLastName}
                      onChange={(e) => setAuthLastName(e.target.value)}
                      placeholder="Babatunde"
                      className="w-full px-4 py-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-xs focus:outline-none focus:border-[#6366F1] focus:ring-1 focus:ring-[#6366F1]"
                      required
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-[#64748B] uppercase tracking-wide mb-1.5">Email Address</label>
                <input
                  type="email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="student@unilorin.edu.ng"
                  className="w-full px-4 py-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-xs focus:outline-none focus:border-[#6366F1] focus:ring-1 focus:ring-[#6366F1]"
                  required
                />
              </div>

              <div>
                <label className="block text-[#64748B] text-xs font-bold uppercase tracking-wide mb-1.5">Password</label>
                <input
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-xs focus:outline-none focus:border-[#6366F1] focus:ring-1 focus:ring-[#6366F1]"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full bg-[#6366F1] hover:bg-[#4F46E5] text-white font-bold text-xs py-3.5 px-4 rounded-xl transition shadow-md shadow-indigo-600/10 flex items-center justify-center gap-2"
              >
                <span>{isSignUpMode ? "Create Free Account" : "Access Study Laboratory"}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <div className="my-6 flex items-center justify-between">
              <span className="h-[1px] w-full bg-[#E2E8F0]"></span>
              <span className="text-[9px] font-mono text-[#64748B] uppercase px-3 whitespace-nowrap tracking-wide">Or connect with</span>
              <span className="h-[1px] w-full bg-[#E2E8F0]"></span>
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="w-full border border-[#E2E8F0] bg-white hover:bg-[#F8FAFC] text-slate-700 font-bold text-xs py-3.5 px-4 rounded-xl transition flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4 mr-1" viewBox="0 0 24 24">
                <path
                  fill="#EA4335"
                  d="M12 5.04c1.66 0 3.2.57 4.38 1.69l3.27-3.27C17.67 1.47 14.99 1 12 1 7.35 1 3.37 3.65 1.39 7.56l3.85 2.99c.92-2.76 3.5-4.51 6.76-4.51z"
                />
                <path
                  fill="#4285F4"
                  d="M23.49 12.27c0-.81-.07-1.59-.2-2.35H12v4.46h6.46c-.28 1.47-1.11 2.71-2.36 3.55l3.66 2.84c2.14-1.97 3.38-4.88 3.38-8.5z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.24 14.24c-.23-.69-.37-1.42-.37-2.19s.14-1.5.37-2.19L1.39 7.56C.5 9.36 0 11.38 0 13.5s.5 4.14 1.39 5.94l3.85-3.2z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c3.24 0 5.97-1.07 7.96-2.91l-3.66-2.84c-1.01.68-2.31 1.09-4.3 1.09-3.26 0-5.84-1.75-6.76-4.51L1.39 17.06C3.37 20.97 7.35 23 12 23z"
                />
              </svg>
              <span>Google Education Account</span>
            </button>
          </div>
        </div>
      ) : (
        /* PROFESSIONAL SIDEBAR + CONTENT LAYOUT WRAPPER */
        <div className="flex h-screen overflow-hidden">
          
          {/* LEFT SIDEBAR PANEL */}
          <aside
            className={`fixed inset-y-0 left-0 z-40 w-72 bg-white border-r border-[#E2E8F0] p-6 flex flex-col gap-6 transform transition-transform duration-300 lg:static lg:translate-x-0 ${
              isSidebarOpen ? "translate-x-0" : "-translate-x-full"
            } shrink-0`}
          >
            {/* Logo */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gradient-to-br from-[#6366F1] to-[#4F46E5] rounded-lg flex items-center justify-center text-white font-bold text-base">E</div>
                <span className="text-lg font-extrabold tracking-tight bg-gradient-to-r from-[#6366F1] to-[#EC4899] bg-clip-text text-transparent">EduBridge AI</span>
              </div>
              <button
                className="lg:hidden p-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition"
                onClick={() => setIsSidebarOpen(false)}
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>

            {/* Past Revision Library list */}
            <div className="flex-1 flex flex-col min-h-0">
              <h3 className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-3">Revision Library</h3>
              
              <div className="flex-1 overflow-y-auto pr-1 space-y-2">
                {loadingHistory ? (
                  <div className="py-12 flex flex-col items-center space-y-2">
                    <RotateCw className="w-5 h-5 text-[#6366F1] animate-spin" />
                    <p className="text-[11px] font-bold text-[#64748B]">Retrieving library...</p>
                  </div>
                ) : historyRecords.length === 0 ? (
                  <div className="py-12 px-4 border border-dashed border-[#E2E8F0] rounded-xl text-center">
                    <Award className="w-6 h-6 text-[#64748B]/30 mx-auto mb-2" />
                    <p className="text-xs font-bold text-[#1E293B]">Library is empty</p>
                    <p className="text-[10px] text-[#64748B] mt-1">Sprints history logs automatically save here.</p>
                  </div>
                ) : (
                  historyRecords.map((record) => {
                    const dateObj = record.loggedTimestamp?.toDate();
                    const dateString = dateObj
                      ? new Date(dateObj).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit"
                        })
                      : "Just Now";

                    const isCurrentActive = activeRecordId === record.id;

                    return (
                      <div
                        key={record.id}
                        onClick={() => handleLoadHistoryRecord(record)}
                        className={`p-3 bg-[#F8FAFC] border rounded-xl cursor-pointer transition-all flex justify-between items-center group relative ${
                          isCurrentActive
                            ? "border-[#6366F1] bg-[#EEF2FF] text-[#6366F1] font-semibold"
                            : "border-transparent hover:border-[#6366F1]/40 hover:bg-[#EEF2FF]/40 text-[#1E293B]"
                        }`}
                      >
                        {isCurrentActive && (
                          <div className="absolute left-0 top-3 bottom-3 w-[3px] bg-[#6366F1] rounded-r-md" />
                        )}
                        <div className="space-y-1.5 max-w-[70%]">
                          <p className="text-xs font-bold line-clamp-2 leading-tight group-hover:text-[#6366F1] transition-colors">
                            {record.notesTopic || "Study Session"}
                          </p>
                          <div className="flex items-center gap-1 text-[10px] text-[#64748B] font-medium">
                            <Calendar className="w-3 h-3 shrink-0" />
                            <span>{dateString}</span>
                          </div>
                        </div>
                        <span className="shrink-0 bg-[#10B981] text-white font-mono text-[9px] font-bold px-2 py-0.5 rounded-full">
                          {record.accuracyPercentage}%
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* DASHBOARD FILE DROP ZONE IN SIDEBAR */}
            <div className="mt-auto pt-4 border-t border-[#E2E8F0]">
              <span className="block text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-2">Lecture Intake</span>
              <div className="relative border border-dashed border-[#6366F1]/50 bg-[#EEF2FF]/30 hover:bg-[#EEF2FF]/60 rounded-xl p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all group">
                <input
                  type="file"
                  id="sidebar-file-upload"
                  accept=".pdf,.docx,.pptx"
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <UploadCloud className="w-5 h-5 text-[#6366F1] group-hover:text-[#4F46E5] transition-colors mb-1.5" />
                <span className="text-xs font-bold text-[#1E293B]">Drop Lecture File</span>
                <span className="text-[10px] text-[#64748B] mt-0.5">PDF, DOCX, or PPTX</span>
              </div>
            </div>

          </aside>

          {/* RIGHT MAIN CONTENT CONTAINER */}
          <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
            
            {/* Top Navigation / Header */}
            <header className="bg-white border-b border-[#E2E8F0] px-6 py-4 flex items-center justify-between z-30 shrink-0">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsSidebarOpen(true)}
                  className="lg:hidden p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 transition"
                >
                  <Menu className="w-5 h-5" />
                </button>
                <div>
                  <h1 className="font-display font-bold text-lg text-[#1E293B] flex items-center gap-2">
                    {sprintLoaded ? (
                      isReviewMode ? (
                        <>
                          <History className="w-4 h-4 text-[#EC4899]" />
                          <span>Revision: {reviewModeTitle}</span>
                        </>
                      ) : (
                        <>
                          <Award className="w-4 h-4 text-[#10B981]" />
                          <span>Cardiac Action Potential Sprint</span>
                        </>
                      )
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-[#6366F1]" />
                        <span>Sprint Workspace Laboratory</span>
                      </>
                    )}
                  </h1>
                  <p className="text-[#64748B] text-xs">
                    {sprintLoaded ? "Complete revision quiz and concepts cards below" : "Extract lecture materials and setup parameters"}
                  </p>
                </div>
              </div>

              {/* User Identity / Logout */}
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex items-center gap-2 bg-[#F8FAFC] border border-[#E2E8F0] px-3 py-1.5 rounded-full">
                  <div className="w-5 h-5 bg-[#6366F1] rounded-full flex items-center justify-center text-white text-[9px] font-bold">
                    {currentUser.displayName ? currentUser.displayName[0].toUpperCase() : "S"}
                  </div>
                  <span className="text-xs font-bold text-[#1E293B]">
                    {currentUser.displayName || "Student User"}
                  </span>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-2 bg-[#F8FAFC] hover:bg-red-50 hover:text-red-600 border border-[#E2E8F0] rounded-lg text-xs font-semibold text-[#64748B] transition flex items-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden xs:inline">Log Out</span>
                </button>
              </div>
            </header>

            {/* Scrollable Workspace area */}
            <main className="flex-1 overflow-y-auto p-6 lg:p-8">
              
              {/* Conditional loading overlay */}
              {isLoading && (
                <div className="fixed inset-0 z-50 bg-white/70 backdrop-blur-md flex flex-col items-center justify-center p-6">
                  <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8 shadow-sm max-w-sm w-full text-center flex flex-col items-center space-y-4">
                    <div className="relative">
                      <RotateCw className="w-10 h-10 text-[#6366F1] animate-spin" />
                      <Sparkles className="w-4 h-4 text-[#EC4899] absolute -top-1 -right-1 animate-pulse" />
                    </div>
                    <h3 className="font-display font-bold text-lg text-[#1E293B]">Analyzing Lecture Outline</h3>
                    <p className="text-[#64748B] text-xs leading-relaxed">Gemini is synthesizing high-yield content...</p>
                    
                    <div className="w-full bg-[#E2E8F0] rounded-full h-1 overflow-hidden">
                      <div className="bg-[#6366F1] h-1 rounded-full animate-pulse w-3/4"></div>
                    </div>
                    <span className="text-[10px] font-mono font-bold text-[#6366F1] tracking-wider uppercase px-2.5 py-1 bg-[#EEF2FF] rounded-lg">
                      {loadingStatus || "Preparing AI model..."}
                    </span>
                  </div>
                </div>
              )}

              {!sprintLoaded ? (
                /* SETUP PANEL */
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start max-w-5xl mx-auto">
                  
                  {/* Notes paste and input container */}
                  <div className="lg:col-span-8 bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-sm space-y-6">
                    <div>
                      <h3 className="font-display font-bold text-lg text-[#1E293B] flex items-center gap-2">
                        <FileText className="w-5 h-5 text-[#6366F1]" />
                        Lecture Excerpt & Textbook outline
                      </h3>
                      <p className="text-[#64748B] text-xs mt-1">
                        Input textbook text or outlines below. Our expert medical tutor parses structures into high-yield revisions.
                      </p>
                    </div>

                    {errorMessage && (
                      <div className="p-4 bg-red-50 border-l-4 border-red-500 text-red-800 text-xs font-semibold rounded-r-xl flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                        <span>{errorMessage}</span>
                      </div>
                    )}

                    {/* Quick upload drop area for dashboard */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                      <div className="md:col-span-7">
                        <label className="block text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-2">Upload lecture document</label>
                        <div className="relative border border-dashed border-[#E2E8F0] hover:border-[#6366F1] rounded-xl bg-[#F8FAFC] p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-colors group">
                          <input
                            type="file"
                            id="dashboard-file-upload"
                            accept=".pdf,.docx,.pptx"
                            onChange={handleFileUpload}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                          />
                          <UploadCloud className="w-6 h-6 text-[#64748B]/60 group-hover:text-[#6366F1] transition-colors mb-1.5" />
                          <span className="text-xs font-bold text-[#1E293B] group-hover:text-[#6366F1] transition-colors">Select Lecture Slides / PDF</span>
                          <span className="text-[10px] text-[#64748B] mt-0.5">Up to 15MB</span>
                        </div>
                      </div>

                      <div className="md:col-span-5 flex flex-col justify-end">
                        <label htmlFor="quiz-count-select" className="block text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-2">Quiz assessment questions</label>
                        <select
                          id="quiz-count-select"
                          value={quizCount}
                          onChange={(e) => setQuizCount(e.target.value)}
                          className="w-full px-3 py-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-xs font-semibold text-[#1E293B] focus:outline-none focus:border-[#6366F1] cursor-pointer appearance-none"
                          style={{ backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%2364748B' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'></polyline></svg>")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '14px' }}
                        >
                          <option value="3">3 high-yield questions</option>
                          <option value="5">5 high-yield questions</option>
                          <option value="10">10 high-yield questions</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label htmlFor="notes-textarea" className="block text-[10px] font-bold text-[#64748B] uppercase tracking-wider">Pasted Materials text</label>
                        <button
                          onClick={() => setNotesInput("")}
                          className="text-[10px] font-bold text-[#64748B] hover:text-red-500 transition-colors"
                        >
                          Clear Text
                        </button>
                      </div>
                      <textarea
                        id="notes-textarea"
                        value={notesInput}
                        onChange={(e) => setNotesInput(e.target.value)}
                        placeholder="Paste guidelines, presentation summaries, or book chapters here..."
                        className="w-full h-80 px-4 py-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-[#1E293B] font-mono text-xs leading-relaxed focus:outline-none focus:border-[#6366F1] focus:ring-1 focus:ring-[#6366F1] resize-none"
                      />
                    </div>

                    <button
                      onClick={generateStudySprint}
                      className="w-full bg-[#6366F1] hover:bg-[#4F46E5] text-white font-bold text-xs py-3.5 rounded-xl transition shadow-sm shadow-[#6366F1]/10 flex items-center justify-center gap-2"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>Compile Study Sprint</span>
                    </button>
                  </div>

                  {/* High Yield Overview / Information */}
                  <div className="lg:col-span-4 space-y-6">
                    
                    <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-sm space-y-4">
                      <h4 className="font-display font-bold text-sm text-[#1E293B] flex items-center gap-1.5">
                        <FileCheck className="w-4.5 h-4.5 text-[#10B981]" />
                        Study Sprint Mechanics
                      </h4>
                      <div className="space-y-3.5 text-xs text-[#64748B] leading-relaxed">
                        <div className="flex gap-2.5">
                          <span className="font-bold text-[#6366F1]">01.</span>
                          <p><strong>Concept Flashcards:</strong> Flip-to-review core terminology with complete detailed summaries on the back.</p>
                        </div>
                        <div className="flex gap-2.5">
                          <span className="font-bold text-[#EC4899]">02.</span>
                          <p><strong>Retention Mnemonics:</strong> Visual acrostic cards with broken-down acronym elements to ensure medical & technical memory longevity.</p>
                        </div>
                        <div className="flex gap-2.5">
                          <span className="font-bold text-[#10B981]">03.</span>
                          <p><strong>Assessment Quiz:</strong> Multi-choice active quiz with immediate expert explanation overlays and automatic persistence to performance logs.</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-gradient-to-br from-[#6366F1] to-[#4F46E5] text-white rounded-2xl p-6 shadow-sm space-y-3">
                      <h4 className="font-display font-bold text-sm">Need a test run?</h4>
                      <p className="text-[11px] text-[#EEF2FF] leading-relaxed">
                        We have preloaded high-yield medical textbook guidelines on the <strong>Cardiac Action Potential</strong>. Simply click <strong>Compile Study Sprint</strong> to witness the full capabilities of EduBridge AI!
                      </p>
                    </div>

                  </div>

                </div>
              ) : (
                /* ACTIVE WORKSPACE */
                <div className="space-y-8 max-w-5xl mx-auto pb-12">
                  
                  {/* Exit reviews banner */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-white border border-[#E2E8F0] rounded-xl shadow-xs gap-4">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-xl text-white shrink-0 ${isReviewMode ? "bg-[#EC4899]" : "bg-[#6366F1]"}`}>
                        {isReviewMode ? <History className="w-4 h-4" /> : <Award className="w-4 h-4" />}
                      </div>
                      <div>
                        <h4 className="font-display font-bold text-sm text-[#1E293B] leading-tight">
                          {isReviewMode ? "Revision Review Module" : "Active study sprint session"}
                        </h4>
                        <p className="text-[#64748B] text-xs mt-0.5">
                          {isReviewMode ? `Reviewing past logged snapshot: ${reviewModeTitle}` : "Complete concepts and answer quiz below to record metrics"}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={resetSprintWorkspace}
                      className={`px-4 py-2 text-xs font-bold rounded-lg transition shadow-xs ${
                        isReviewMode
                          ? "bg-[#EC4899] hover:bg-[#D01C7B] text-white"
                          : "border border-[#E2E8F0] hover:bg-[#F8FAFC] text-slate-700"
                      }`}
                    >
                      {isReviewMode ? "Exit Review Mode" : "New Study Sprint"}
                    </button>
                  </div>

                  {/* Bento Cards Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                    
                    {/* Bento Card 1: Core Concept Flashcards */}
                    {activeSprint && activeSprint.flashcards && activeSprint.flashcards.length > 0 && (
                      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-sm flex flex-col h-[400px]">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                          <span className="text-[10px] font-mono font-bold text-[#6366F1] tracking-wider uppercase bg-[#EEF2FF] px-2.5 py-1 rounded-lg">
                            ⚡ Core Concept Flashcards
                          </span>
                          <span className="text-xs font-mono font-bold text-[#64748B]">
                            {currentCardIndex + 1} of {activeSprint.flashcards.length}
                          </span>
                        </div>

                        {/* 3D card layout */}
                        <div className="perspective-1000 w-full flex-1 mb-4">
                          <div
                            onClick={() => setIsCardFlipped(prev => !prev)}
                            className={`relative w-full h-full duration-500 preserve-3d cursor-pointer ${isCardFlipped ? "rotate-y-180" : ""}`}
                          >
                            {/* Front Side */}
                            <div className="absolute inset-0 w-full h-full backface-hidden rounded-xl bg-[#EEF2FF]/40 border border-[#C7D2FE] p-6 flex flex-col justify-center items-center text-center">
                              <span className="text-[9px] font-bold text-[#6366F1]/60 tracking-wider uppercase mb-2">Front of card</span>
                              <p className="font-display font-bold text-base text-[#1E293B] px-3">
                                {activeSprint.flashcards[currentCardIndex].front}
                              </p>
                            </div>

                            {/* Back Side */}
                            <div className="absolute inset-0 w-full h-full backface-hidden rotate-y-180 rounded-xl bg-sky-50/40 border border-sky-200 p-6 flex flex-col justify-start overflow-y-auto">
                              <span className="text-[9px] font-bold text-sky-400 tracking-wider uppercase mb-2 text-center shrink-0">Explanation summary</span>
                              <div className="flex-1 w-full overflow-y-auto">
                                {renderFormattedText(activeSprint.flashcards[currentCardIndex].back, "text-xs")}
                              </div>
                            </div>
                          </div>
                        </div>

                        <p className="text-[9px] font-bold text-[#64748B] text-center mb-4">👇 Click card to flip and verify recall</p>

                        {/* Navigation Progress bar layout */}
                        <div className="flex items-center justify-between mt-auto">
                          <button
                            onClick={() => {
                              setIsCardFlipped(false);
                              setTimeout(() => {
                                setCurrentCardIndex(prev => (prev - 1 + activeSprint.flashcards.length) % activeSprint.flashcards.length);
                              }, 150);
                            }}
                            className="p-1.5 border border-[#E2E8F0] hover:bg-[#F8FAFC] rounded-lg transition"
                          >
                            <ChevronLeft className="w-4 h-4 text-slate-600" />
                          </button>
                          
                          {/* Progress pill designed */}
                          <div className="progress-pill mx-4">
                            <div
                              className="progress-fill"
                              style={{ width: `${((currentCardIndex + 1) / activeSprint.flashcards.length) * 100}%` }}
                            />
                          </div>

                          <button
                            onClick={() => {
                              setIsCardFlipped(false);
                              setTimeout(() => {
                                setCurrentCardIndex(prev => (prev + 1) % activeSprint.flashcards.length);
                              }, 150);
                            }}
                            className="p-1.5 border border-[#E2E8F0] hover:bg-[#F8FAFC] rounded-lg transition"
                          >
                            <ChevronRight className="w-4 h-4 text-slate-600" />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Bento Card 2: Retention Mnemonics */}
                    {activeSprint && activeSprint.mnemonics && activeSprint.mnemonics.length > 0 && (
                      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-sm flex flex-col h-[400px]">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                          <span className="text-[10px] font-mono font-bold text-[#EC4899] tracking-wider uppercase bg-[#FDF2F8] px-2.5 py-1 rounded-lg">
                            🧠 Memory Retention Acrostics
                          </span>
                          <span className="text-xs font-mono font-bold text-[#64748B]">
                            {currentMnemonicIndex + 1} of {activeSprint.mnemonics.length}
                          </span>
                        </div>

                        {/* 3D card layout */}
                        <div className="perspective-1000 w-full flex-1 mb-4">
                          <div
                            onClick={() => setIsMnemonicFlipped(prev => !prev)}
                            className={`relative w-full h-full duration-500 preserve-3d cursor-pointer ${isMnemonicFlipped ? "rotate-y-180" : ""}`}
                          >
                            {/* Front Side */}
                            <div className="absolute inset-0 w-full h-full backface-hidden rounded-xl bg-[#FDF2F8]/60 border border-pink-200 p-6 flex flex-col justify-center items-center text-center">
                              <span className="text-[9px] font-bold text-[#EC4899]/60 tracking-wider uppercase mb-2">Acronym Word</span>
                              <p className="font-display font-extrabold text-2xl text-[#EC4899] tracking-widest font-mono">
                                {activeSprint.mnemonics[currentMnemonicIndex].front}
                              </p>
                            </div>

                            {/* Back Side */}
                            <div className="absolute inset-0 w-full h-full backface-hidden rotate-y-180 rounded-xl bg-amber-50/40 border border-amber-200 p-6 flex flex-col justify-start overflow-y-auto">
                              <span className="text-[9px] font-bold text-amber-500/80 tracking-wider uppercase mb-2 text-center shrink-0">Mnemonic letters breakdown</span>
                              <div className="flex-1 w-full overflow-y-auto">
                                {renderFormattedText(activeSprint.mnemonics[currentMnemonicIndex].back, "text-sm")}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Selector indicator */}
                        <div className="mt-auto">
                          <div className="flex items-center justify-between mb-2">
                            <button
                              onClick={() => {
                                setIsMnemonicFlipped(false);
                                setTimeout(() => {
                                  setCurrentMnemonicIndex(prev => (prev - 1 + activeSprint.mnemonics.length) % activeSprint.mnemonics.length);
                                }, 150);
                              }}
                              className="p-1.5 border border-[#E2E8F0] hover:bg-[#F8FAFC] rounded-lg transition"
                            >
                              <ChevronLeft className="w-4 h-4 text-slate-600" />
                            </button>
                            <span className="text-[9px] text-[#64748B] font-bold">Quick Switch Mnemonics Index</span>
                            <button
                              onClick={() => {
                                setIsMnemonicFlipped(false);
                                setTimeout(() => {
                                  setCurrentMnemonicIndex(prev => (prev + 1) % activeSprint.mnemonics.length);
                                }, 150);
                              }}
                              className="p-1.5 border border-[#E2E8F0] hover:bg-[#F8FAFC] rounded-lg transition"
                            >
                              <ChevronRight className="w-4 h-4 text-slate-600" />
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-1.5 justify-center">
                            {activeSprint.mnemonics.map((m, idx) => (
                              <button
                                key={idx}
                                onClick={() => {
                                  setCurrentMnemonicIndex(idx);
                                  setIsMnemonicFlipped(false);
                                }}
                                className={`px-2 py-1 text-[10px] rounded-md font-bold transition-all border ${
                                  currentMnemonicIndex === idx
                                    ? "bg-[#EC4899]/10 text-[#EC4899] border-[#EC4899]/40"
                                    : "bg-slate-50 hover:bg-slate-100 text-slate-500 border-[#E2E8F0]"
                                }`}
                              >
                                {m.front}
                              </button>
                            ))}
                          </div>
                        </div>

                      </div>
                    )}

                  </div>

                  {/* Section 3: Assessment Quiz Bento block */}
                  <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 md:p-8 shadow-sm">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
                      <div>
                        <span className="text-[10px] font-mono font-bold text-[#10B981] tracking-wider uppercase bg-[#E6F4EA] px-2.5 py-1 rounded-lg">
                          📝 Active Sprint Assessment
                        </span>
                        <h3 className="font-display font-bold text-base text-[#1E293B] mt-2">Evaluation Quiz</h3>
                      </div>
                      <span className="text-xs font-mono font-semibold text-[#64748B]">
                        Answered: {answeredCount} of {quizQuestions.length}
                      </span>
                    </div>

                    <div className="space-y-6">
                      {quizQuestions.map((q, qIndex) => {
                        const hasBeenAnswered = q.selectedAnswer !== undefined;

                        return (
                          <div key={qIndex} className="p-5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl space-y-4">
                            <p className="font-display font-bold text-sm text-[#1E293B] leading-relaxed">
                              <span className="text-[#6366F1] font-extrabold mr-1.5">Q{qIndex + 1}.</span>
                              {q.question}
                            </p>

                            {/* Option list buttons */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {q.options.map((option, oIndex) => {
                                const isSelected = q.selectedAnswer === option;
                                const isCorrectOption = option === q.correctAnswer;

                                let btnClass = "border-[#E2E8F0] bg-white text-[#1E293B] hover:bg-[#F8FAFC] hover:border-[#6366F1]/40";
                                if (hasBeenAnswered) {
                                  if (isSelected) {
                                    btnClass = isCorrectOption
                                      ? "bg-[#10B981] border-[#10B981] text-white font-bold"
                                      : "bg-red-500 border-red-500 text-white font-bold";
                                  } else if (isCorrectOption) {
                                    btnClass = "border-[#10B981] border-2 border-dashed bg-emerald-50 text-[#10B981] font-bold";
                                  } else {
                                    btnClass = "border-slate-100 bg-white opacity-40 text-slate-400 pointer-events-none";
                                  }
                                }

                                return (
                                  <button
                                    key={oIndex}
                                    disabled={hasBeenAnswered}
                                    onClick={() => handleOptionSelect(qIndex, option)}
                                    className={`px-4 py-3 border rounded-xl text-xs font-medium text-left transition duration-150 flex items-center justify-between gap-2 cursor-pointer ${btnClass}`}
                                  >
                                    <span>{option}</span>
                                    {hasBeenAnswered && isCorrectOption && (
                                      <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                    )}
                                  </button>
                                );
                              })}
                            </div>

                            {/* Explanation Feedback Block */}
                            {hasBeenAnswered && (
                              <div className="p-3.5 bg-[#EEF2FF] border-l-4 border-[#6366F1] rounded-r-xl flex items-start gap-2 text-xs text-[#1E293B]">
                                <span className="font-bold shrink-0 text-[#6366F1]">💡 Feedback:</span>
                                <p className="leading-relaxed">{q.explanation}</p>
                              </div>
                            )}

                          </div>
                        );
                      })}
                    </div>

                    {/* Finish evaluation results banner */}
                    {answeredCount === quizQuestions.length && (
                      <div className="mt-8 p-6 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-center space-y-4 max-w-md mx-auto">
                        <div className="bg-[#EEF2FF] p-3 rounded-full w-12 h-12 flex items-center justify-center mx-auto text-[#6366F1]">
                          <Award className="w-6 h-6" />
                        </div>
                        <div>
                          <h4 className="font-display font-bold text-base text-[#1E293B]">Sprint Completed!</h4>
                          <p className="text-[#64748B] text-xs">A snapshot has been saved to your personal Revision Library.</p>
                        </div>

                        <div className="py-3 border-y border-[#E2E8F0] flex justify-around items-center">
                          <div>
                            <p className="text-[9px] font-mono font-bold text-[#64748B] uppercase tracking-wide">Points Scored</p>
                            <p className="font-display font-bold text-xl text-[#1E293B]">{correctCount} / {quizQuestions.length}</p>
                          </div>
                          <div>
                            <p className="text-[9px] font-mono font-bold text-[#64748B] uppercase tracking-wide">Accuracy</p>
                            <p className="font-display font-bold text-xl text-[#6366F1]">{Math.round((correctCount / quizQuestions.length) * 100)}%</p>
                          </div>
                        </div>

                        <button
                          onClick={resetSprintWorkspace}
                          className="w-full bg-[#6366F1] hover:bg-[#4F46E5] text-white font-bold text-xs py-2.5 rounded-xl transition shadow-sm"
                        >
                          Unlock Next Sprint
                        </button>
                      </div>
                    )}

                    {/* Add extra questions */}
                    {!isReviewMode && answeredCount < quizQuestions.length && (
                      <div className="mt-6 pt-5 border-t border-slate-100 flex justify-center">
                        <button
                          onClick={handleAddMoreQuestions}
                          disabled={addingQuestions}
                          className="px-4 py-2 border border-[#E2E8F0] hover:border-[#6366F1] hover:bg-[#EEF2FF]/40 text-slate-700 hover:text-[#6366F1] text-xs font-bold rounded-xl transition flex items-center gap-1.5"
                        >
                          {addingQuestions ? (
                            <>
                              <RotateCw className="w-3 h-3 animate-spin" />
                              <span>Expanding Assessment...</span>
                            </>
                          ) : (
                            <>
                              <Plus className="w-3 h-3" />
                              <span>Generate 3 More Questions</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}

                  </div>

                </div>
              )}

            </main>

          </div>

        </div>
      )}

    </div>
  );
}
