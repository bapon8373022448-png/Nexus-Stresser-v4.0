/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Shield, 
  Zap, 
  Terminal, 
  Phone, 
  AlertTriangle, 
  Activity, 
  Lock, 
  Wifi, 
  Cpu,
  Play,
  Square,
  RefreshCw,
  Clock,
  History,
  Trash2,
  Settings,
  Key,
  Eye,
  EyeOff,
  Unlock,
  LogOut,
  Mic,
  MicOff,
  Volume2,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { generateWelcomeVoice, transcribeAudio } from './services/gemini';
import { db, auth } from './firebase';
  import { collection, addDoc, updateDoc, doc, getDocs, query, orderBy, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from 'firebase/auth';

interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  category?: 'NETWORK' | 'SYSTEM' | 'SECURITY' | 'GATEWAY';
}

interface Notification {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

interface HistoryEntry {
  id: string;
  phoneNumber: string;
  timestamp: string;
  status: 'COMPLETED' | 'ABORTED' | 'IN_PROGRESS';
  count: number;
  sessionId?: string;
  userAgent?: string;
}

export default function App() {
  const [isBooted, setIsBooted] = useState(false);
  const [activeTab, setActiveTab] = useState<'stresser' | 'admin' | 'settings'>('stresser');
  const [isAdminAuthorized, setIsAdminAuthorized] = useState(false);
  const [adminUser, setAdminUser] = useState<any>(null);
  const [loginError, setLoginError] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [globalHistory, setGlobalHistory] = useState<HistoryEntry[]>([]);
  
  const [sessionId] = useState(() => {
    let sid = localStorage.getItem('nexus_session_id');
    if (!sid) {
      sid = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('nexus_session_id', sid);
    }
    return sid;
  });

  const [phoneNumber, setPhoneNumber] = useState('');
  const [isBombing, setIsBombing] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [progress, setProgress] = useState(0);
  const [count, setCount] = useState(0);
  const [targetCount, setTargetCount] = useState(50);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [latency, setLatency] = useState(1200);
  const [packetLoss, setPacketLoss] = useState(0);
  const [customUserAgent, setCustomUserAgent] = useState('Nexus-Protocol/4.0');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [currentHistoryId, setCurrentHistoryId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);
  const [cpuLoad, setCpuLoad] = useState(42);

  useEffect(() => {
    const interval = setInterval(() => {
      setCpuLoad(prev => {
        const change = Math.floor(Math.random() * 7) - 3;
        const newLoad = prev + change;
        return Math.min(Math.max(newLoad, 15), 85);
      });
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  const addNotification = (message: string, type: Notification['type'] = 'info') => {
    const id = Math.random().toString(36).substr(2, 9);
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 3000);
  };

  // Load history from localStorage
  useEffect(() => {
    const savedHistory = localStorage.getItem('nexus_stresser_history');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error('Failed to parse history', e);
      }
    }
  }, []);

  // Save history to localStorage
  useEffect(() => {
    localStorage.setItem('nexus_stresser_history', JSON.stringify(history));
  }, [history]);

  // Listen to auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && user.email === 'bapon8373022448@gmail.com') {
        setIsAdminAuthorized(true);
        setAdminUser(user);
      } else {
        setIsAdminAuthorized(false);
        setAdminUser(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // Fetch global history if admin
  useEffect(() => {
    if (isAdminAuthorized) {
      const q = query(collection(db, 'history'), orderBy('timestamp', 'desc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const historyData: HistoryEntry[] = [];
        snapshot.forEach((doc) => {
          historyData.push({ id: doc.id, ...doc.data() } as HistoryEntry);
        });
        setGlobalHistory(historyData);
      }, (error) => {
        console.error("Error fetching history:", error);
      });
      return () => unsubscribe();
    }
  }, [isAdminAuthorized]);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthenticating(true);
    setLoginError('');

    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      if (result.user.email === 'bapon8373022448@gmail.com') {
        addLog('ADMIN ACCESS GRANTED', 'success', 'SECURITY');
        addNotification('ADMIN ACCESS GRANTED', 'success');
      } else {
        await signOut(auth);
        setLoginError('UNAUTHORIZED EMAIL ADDRESS');
        addLog('UNAUTHORIZED ADMIN ACCESS ATTEMPT', 'error', 'SECURITY');
        addNotification('UNAUTHORIZED ACCESS', 'error');
      }
    } catch (error: any) {
      setLoginError(error.message || 'AUTHENTICATION FAILED');
      addLog('ADMIN AUTHENTICATION ERROR', 'error', 'SECURITY');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    addLog('ADMIN SESSION TERMINATED', 'warning', 'SECURITY');
    addNotification('ADMIN LOGGED OUT', 'info');
  };

  const handleBoot = async () => {
    setIsBooted(true);
    await generateWelcomeVoice();
    addLog('SYSTEM INITIALIZED: NEXUS STRESSER V4.0', 'success', 'SYSTEM');
    addLog('WELCOME SIR. AWAITING COMMANDS.', 'info', 'SYSTEM');
    addNotification('SYSTEM ONLINE', 'success');
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = (reader.result as string).split(',')[1];
          setIsTranscribing(true);
          addLog('PROCESSING VOICE COMMAND...', 'info');
          const transcription = await transcribeAudio(base64Audio);
          if (transcription) {
            // Clean transcription to keep only numbers if it looks like a phone number
            let cleaned = transcription.replace(/\D/g, '');
            if (cleaned.startsWith('91') && cleaned.length > 10) {
              cleaned = cleaned.substring(2);
            }
            if (cleaned.length >= 10) {
              const finalNumber = cleaned.substring(cleaned.length - 10);
              setPhoneNumber(finalNumber);
              addLog(`TARGET UPDATED VIA VOICE: +91 ${finalNumber}`, 'success');
            } else {
              addLog(`TRANSCRIPTION: ${transcription}`, 'info');
            }
          }
          setIsTranscribing(false);
        };
      };

      mediaRecorder.start();
      setIsRecording(true);
      addLog('LISTENING FOR VOICE COMMAND...', 'warning');
    } catch (err) {
      console.error("Error accessing microphone:", err);
      addLog('MICROPHONE ACCESS DENIED', 'error');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const addLog = (message: string, type: LogEntry['type'] = 'info', category: LogEntry['category'] = 'SYSTEM') => {
    const newLog: LogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      message,
      type,
      category
    };
    setLogs(prev => [...prev.slice(-49), newLog]);
  };

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const startBombing = async () => {
    if (!phoneNumber || phoneNumber.length !== 10) {
      addLog('INVALID TARGET: 10-digit Indian phone number required', 'error');
      return;
    }

    const newHistoryId = Math.random().toString(36).substr(2, 9);
    const newEntry: HistoryEntry = {
      id: newHistoryId,
      phoneNumber,
      timestamp: new Date().toISOString(),
      status: 'IN_PROGRESS',
      count: 0,
      sessionId,
      userAgent: customUserAgent
    };

    setHistory(prev => [newEntry, ...prev].slice(0, 50));
    setCurrentHistoryId(newHistoryId);
    setIsBombing(true);
    setProgress(0);
    setCount(0);
    setLogs([]);
    addLog(`INITIALIZING ATTACK VECTOR: +91 ${phoneNumber}`, 'warning', 'NETWORK');
    addLog('BYPASSING FIREWALL PROTOCOLS...', 'info', 'SECURITY');
    addLog('ESTABLISHING SECURE TUNNEL...', 'success', 'NETWORK');
    addNotification('ATTACK INITIALIZED', 'warning');
    
    // Save to Firestore
    try {
      await setDoc(doc(db, 'history', newHistoryId), newEntry);
    } catch (error) {
      console.error("Error saving to Firestore:", error);
    }
  };

  const stopBombing = async () => {
    setIsBombing(false);
    if (currentHistoryId) {
      setHistory(prev => prev.map(entry => 
        entry.id === currentHistoryId 
          ? { ...entry, status: 'ABORTED', count } 
          : entry
      ));
      
      // Update Firestore
      try {
        const entryToUpdate = history.find(e => e.id === currentHistoryId);
        if (entryToUpdate) {
          await updateDoc(doc(db, 'history', currentHistoryId), {
            status: 'ABORTED',
            count,
            sessionId,
            phoneNumber: entryToUpdate.phoneNumber,
            timestamp: entryToUpdate.timestamp
          });
        }
      } catch (error) {
        console.error("Error updating Firestore:", error);
      }
    }
    addLog('PROCESS TERMINATED BY USER', 'warning', 'SYSTEM');
    addNotification('ATTACK ABORTED', 'error');
  };

  const clearHistory = async () => {
    if (isAdminAuthorized) {
      try {
        const q = query(collection(db, 'history'));
        const snapshot = await getDocs(q);
        const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(deletePromises);
        addLog('GLOBAL HISTORY DATABASE PURGED', 'info');
      } catch (error) {
        console.error("Error clearing history:", error);
      }
    } else {
      setHistory([]);
      addLog('LOCAL HISTORY DATABASE PURGED', 'info');
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isBombing && count < targetCount) {
      interval = setInterval(() => {
        setCount(prev => {
          const next = prev + 1;
          const services = ['Amazon', 'Flipkart', 'Uber', 'Zomato', 'Swiggy', 'Ola', 'Byjus', 'Unacademy', 'Snapdeal', 'Lenskart'];
          const service = services[Math.floor(Math.random() * services.length)];
          
          const isLost = Math.random() * 100 < packetLoss;

          if (isLost) {
            setTimeout(() => addLog(`RESOLVING GATEWAY: ${service.toUpperCase()}`, 'info', 'NETWORK'), 0);
            setTimeout(() => addLog(`CONNECTION TIMEOUT: PACKET LOSS AT ${service.toUpperCase()}`, 'error', 'NETWORK'), 200);
          } else {
            // Detailed logging sequence
            setTimeout(() => addLog(`RESOLVING GATEWAY: ${service.toUpperCase()}`, 'info', 'NETWORK'), 0);
            setTimeout(() => addLog(`HANDSHAKE SUCCESSFUL: ${service.toUpperCase()}`, 'success', 'GATEWAY'), 200);
            setTimeout(() => addLog(`OTP PACKET DELIVERED TO +91 ${phoneNumber}`, 'success', 'GATEWAY'), 400);
          }
          
          setProgress((next / targetCount) * 100);
          
          if (next >= targetCount) {
            setIsBombing(false);
            if (currentHistoryId) {
              setHistory(prev => prev.map(entry => 
                entry.id === currentHistoryId 
                  ? { ...entry, status: 'COMPLETED', count: targetCount } 
                  : entry
              ));
              
              const entryToUpdate = history.find(e => e.id === currentHistoryId);
              if (entryToUpdate) {
                updateDoc(doc(db, 'history', currentHistoryId), {
                  status: 'COMPLETED',
                  count: targetCount,
                  sessionId,
                  phoneNumber: entryToUpdate.phoneNumber,
                  timestamp: entryToUpdate.timestamp
                }).catch(console.error);
              }
            }
            addLog('ATTACK COMPLETED: ALL PACKETS DELIVERED', 'success', 'SYSTEM');
            addNotification('ATTACK SUCCESSFUL', 'success');
            return targetCount;
          }
          return next;
        });
      }, latency); 
    }
    return () => clearInterval(interval);
  }, [isBombing, count, targetCount, currentHistoryId, phoneNumber, latency, packetLoss]);

  return (
    <div className="min-h-screen bg-[#050505] text-[#00ff41] font-mono selection:bg-[#00ff41] selection:text-black p-4 md:p-8 flex flex-col items-center justify-center overflow-hidden relative">
      <div className="crt-overlay" />
      <div className="scanline" />
      
      <AnimatePresence>
        {!isBooted && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center p-6 text-center"
          >
            <div className="absolute inset-0 opacity-10 pointer-events-none overflow-hidden">
              <div className="grid grid-cols-12 gap-4 h-full">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="h-full border-r border-[#00ff41]/20 animate-pulse" style={{ animationDelay: `${i * 0.1}s` }} />
                ))}
              </div>
            </div>

            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="relative"
            >
              <div className="p-8 bg-[#00ff41]/5 rounded-full border-2 border-[#00ff41]/20 mb-8 relative group">
                <div className="absolute inset-0 rounded-full bg-[#00ff41]/10 animate-ping" />
                <Zap className="w-20 h-20 text-[#00ff41] relative z-10" />
              </div>
            </motion.div>

            <h1 className="text-4xl md:text-6xl font-bold tracking-tighter uppercase mb-4 text-shadow-[0_0_20px_#00ff41] glitch-text" data-text="Nexus Stresser">
              Nexus Stresser
            </h1>
            <p className="text-xs md:text-sm opacity-60 uppercase tracking-[0.5em] mb-12">
              Advanced Signal Penetration Interface
            </p>

            <button 
              onClick={handleBoot}
              className="group relative px-12 py-4 bg-transparent border-2 border-[#00ff41] text-[#00ff41] font-bold uppercase tracking-widest overflow-hidden transition-all hover:text-black"
            >
              <div className="absolute inset-0 bg-[#00ff41] translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
              <span className="relative z-10 flex items-center gap-3">
                <Volume2 className="w-5 h-5" />
                Initialize System
              </span>
            </button>

            <div className="mt-12 flex gap-8 opacity-20 text-[10px] uppercase tracking-widest">
              <span>Encrypted: AES-256</span>
              <span>Protocol: v4.0.2</span>
              <span>Status: Ready</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Background Matrix Effect Simulation */}
      <div className="fixed inset-0 opacity-5 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,_#00ff41_0%,_transparent_70%)] opacity-20" />
        <div className="grid grid-cols-12 gap-4 h-full">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-full border-r border-[#00ff41]/20" />
          ))}
        </div>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-4xl z-10"
      >
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 border-b border-[#00ff41]/30 pb-4 gap-4 relative">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#00ff41]/10 rounded-lg border border-[#00ff41]/30 shadow-[0_0_15px_rgba(0,255,65,0.2)]">
              <Zap className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tighter uppercase glitch-text" data-text="Nexus Stresser v4.0">Nexus Stresser v4.0</h1>
              <p className="text-[10px] opacity-60 uppercase tracking-widest">Advanced Signal Penetration Interface</p>
            </div>
          </div>
          
          <div className="flex items-center bg-black/50 border border-[#00ff41]/20 rounded-lg p-1">
            <button 
              onClick={() => setActiveTab('stresser')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-[10px] uppercase font-bold transition-all ${
                activeTab === 'stresser' ? 'bg-[#00ff41] text-black shadow-[0_0_15px_rgba(0,255,65,0.3)]' : 'text-[#00ff41]/50 hover:text-[#00ff41]'
              }`}
            >
              <Zap className="w-3 h-3" />
              Stresser
            </button>
            <button 
              onClick={() => setActiveTab('admin')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-[10px] uppercase font-bold transition-all ${
                activeTab === 'admin' ? 'bg-[#00ff41] text-black shadow-[0_0_15px_rgba(0,255,65,0.3)]' : 'text-[#00ff41]/50 hover:text-[#00ff41]'
              }`}
            >
              <Shield className="w-3 h-3" />
              Admin Panel
            </button>
            <button 
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-[10px] uppercase font-bold transition-all ${
                activeTab === 'settings' ? 'bg-[#00ff41] text-black shadow-[0_0_15px_rgba(0,255,65,0.3)]' : 'text-[#00ff41]/50 hover:text-[#00ff41]'
              }`}
            >
              <Settings className="w-3 h-3" />
              Settings
            </button>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'stresser' ? (
            <motion.div
              key="stresser-tab"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-6"
            >
              {/* Controls Panel */}
              <div className="lg:col-span-1 space-y-6">
                <div className="bg-[#111] border border-[#00ff41]/20 rounded-xl p-6 shadow-[0_0_30px_rgba(0,255,65,0.05)] cyber-border">
                  <div className="flex items-center gap-2 mb-6 text-xs uppercase font-bold opacity-80">
                    <Terminal className="w-4 h-4" />
                    Target Configuration
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-[10px] uppercase mb-2 opacity-60">Phone Number (India Only)</label>
                      <div className="relative flex items-center">
                        <div className="absolute left-0 top-0 bottom-0 flex items-center justify-center pl-3 pr-2 border-r border-[#00ff41]/30 bg-[#00ff41]/5 rounded-l-lg pointer-events-none">
                          <Phone className="w-4 h-4 opacity-40 mr-2" />
                          <span className="text-[#00ff41] font-bold">+91</span>
                        </div>
                        <input 
                          type="tel"
                          placeholder="9XXXX XXXXX"
                          value={phoneNumber}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '');
                            if (val.length <= 10) setPhoneNumber(val);
                          }}
                          disabled={isBombing}
                          className="w-full bg-black border border-[#00ff41]/30 rounded-lg py-3 pl-[84px] pr-12 focus:outline-none focus:border-[#00ff41] transition-colors placeholder:opacity-20"
                        />
                        <button
                          onClick={isRecording ? stopRecording : startRecording}
                          disabled={isBombing || isTranscribing}
                          className={`absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-md transition-all ${
                            isRecording 
                              ? 'bg-red-500 text-white animate-pulse' 
                              : 'text-[#00ff41]/40 hover:text-[#00ff41] hover:bg-[#00ff41]/10'
                          }`}
                          title={isRecording ? "Stop Recording" : "Voice Input"}
                        >
                          {isTranscribing ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : isRecording ? (
                            <MicOff className="w-4 h-4" />
                          ) : (
                            <Mic className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase mb-2 opacity-60">Request Count: {targetCount}</label>
                      <input 
                        type="range"
                        min="10"
                        max="200"
                        step="10"
                        value={targetCount}
                        onChange={(e) => setTargetCount(parseInt(e.target.value))}
                        disabled={isBombing}
                        className="w-full accent-[#00ff41] bg-black h-1 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>

                    <div className="pt-2">
                      <button 
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className="w-full flex items-center justify-between text-[10px] uppercase font-bold opacity-60 hover:opacity-100 transition-opacity"
                      >
                        <div className="flex items-center gap-2">
                          <Settings className="w-3 h-3" />
                          Advanced Settings
                        </div>
                        {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>

                      <AnimatePresence>
                        {showAdvanced && (
                          <motion.div 
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden space-y-4 pt-4"
                          >
                            <div>
                              <label className="block text-[9px] uppercase mb-2 opacity-50">Latency Simulation: {latency}ms</label>
                              <input 
                                type="range"
                                min="200"
                                max="5000"
                                step="100"
                                value={latency}
                                onChange={(e) => setLatency(parseInt(e.target.value))}
                                disabled={isBombing}
                                className="w-full accent-[#00ff41] bg-black h-1 rounded-lg appearance-none cursor-pointer"
                              />
                            </div>
                            <div>
                              <label className="block text-[9px] uppercase mb-2 opacity-50">Packet Loss: {packetLoss}%</label>
                              <input 
                                type="range"
                                min="0"
                                max="90"
                                step="5"
                                value={packetLoss}
                                onChange={(e) => setPacketLoss(parseInt(e.target.value))}
                                disabled={isBombing}
                                className="w-full accent-[#00ff41] bg-black h-1 rounded-lg appearance-none cursor-pointer"
                              />
                            </div>
                            <div>
                              <label className="block text-[9px] uppercase mb-2 opacity-50">Custom User Agent</label>
                              <input 
                                type="text"
                                value={customUserAgent}
                                onChange={(e) => setCustomUserAgent(e.target.value)}
                                disabled={isBombing}
                                className="w-full bg-black border border-[#00ff41]/20 rounded-lg py-2 px-3 text-[10px] focus:outline-none focus:border-[#00ff41] transition-colors"
                              />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="pt-4">
                      {!isBombing ? (
                        <button 
                          onClick={startBombing}
                          className="w-full bg-[#00ff41] text-black font-bold py-4 rounded-lg flex items-center justify-center gap-2 hover:bg-[#00cc34] transition-all active:scale-95 shadow-[0_0_20px_rgba(0,255,65,0.2)]"
                        >
                          <Play className="w-4 h-4 fill-current" />
                          EXECUTE ATTACK
                        </button>
                      ) : (
                        <button 
                          onClick={stopBombing}
                          className="w-full bg-red-600 text-white font-bold py-4 rounded-lg flex items-center justify-center gap-2 hover:bg-red-700 transition-all active:scale-95 shadow-[0_0_20px_rgba(220,38,38,0.2)]"
                        >
                          <Square className="w-4 h-4 fill-current" />
                          ABORT MISSION
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-[#111] border border-[#00ff41]/20 rounded-xl p-6 cyber-border">
                  <div className="flex items-center gap-2 mb-4 text-xs uppercase font-bold opacity-80">
                    <Activity className="w-4 h-4" />
                    System Status
                  </div>
                  <div className="space-y-3">
                    <StatusItem 
                      label="CPU Load" 
                      value={`${cpuLoad}%`} 
                      icon={<Cpu className="w-3 h-3" />} 
                      status={cpuLoad > 75 ? 'warning' : 'normal'} 
                    />
                    <StatusItem 
                      label="Encryption" 
                      value="AES-256" 
                      icon={<Lock className="w-3 h-3" />} 
                      status="normal" 
                    />
                    <StatusItem 
                      label="Gateways" 
                      value="14 Active" 
                      icon={<Wifi className="w-3 h-3" />} 
                      status="normal" 
                    />
                  </div>
                </div>
              </div>

              {/* Terminal Panel */}
              <div className="lg:col-span-2 flex flex-col h-[500px] lg:h-auto">
                <div className="flex-1 bg-black border border-[#00ff41]/20 rounded-xl overflow-hidden flex flex-col shadow-[inset_0_0_50px_rgba(0,255,65,0.05)] cyber-border">
                  <div className="bg-[#111] px-4 py-2 border-b border-[#00ff41]/20 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
                        <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/50" />
                        <div className="w-2.5 h-2.5 rounded-full bg-green-500/50" />
                      </div>
                      <span className="text-[10px] uppercase opacity-40 ml-2">Console Output</span>
                    </div>
                    <div className="text-[10px] opacity-40">TTY: /dev/pts/0</div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 space-y-1 scrollbar-hide">
                    <AnimatePresence mode="popLayout">
                      {logs.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center opacity-20 space-y-4">
                          <Terminal className="w-12 h-12" />
                          <p className="text-xs uppercase tracking-[0.2em]">Awaiting Command...</p>
                        </div>
                      )}
                      {logs.map((log) => (
                        <motion.div 
                          key={log.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className={`text-[11px] flex gap-3 py-0.5 border-b border-[#00ff41]/5 last:border-0 ${
                            log.type === 'success' ? 'text-[#00ff41]' :
                            log.type === 'warning' ? 'text-yellow-400' :
                            log.type === 'error' ? 'text-red-500' :
                            'text-[#00ff41]/60'
                          }`}
                        >
                          <span className="opacity-30 shrink-0 font-mono">[{log.timestamp}]</span>
                          <span className={`shrink-0 font-bold px-1 rounded text-[9px] ${
                            log.category === 'NETWORK' ? 'bg-blue-500/20 text-blue-400' :
                            log.category === 'SECURITY' ? 'bg-red-500/20 text-red-400' :
                            log.category === 'GATEWAY' ? 'bg-purple-500/20 text-purple-400' :
                            'bg-[#00ff41]/10 text-[#00ff41]/60'
                          }`}>
                            {log.category}
                          </span>
                          <span className="break-all">{log.message}</span>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                    <div ref={logEndRef} />
                  </div>

                  {/* Progress Bar */}
                  <div className="p-4 bg-[#111] border-t border-[#00ff41]/20">
                    <div className="flex items-center justify-between mb-2 text-[10px] uppercase">
                      <span>Progress: {Math.round(progress)}%</span>
                      <span>{count} / {targetCount} Packets</span>
                    </div>
                    <div className="w-full bg-black h-1.5 rounded-full overflow-hidden border border-[#00ff41]/10">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        className="h-full bg-[#00ff41] shadow-[0_0_10px_#00ff41]"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="admin-tab"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-2xl mx-auto"
            >
              {!isAdminAuthorized ? (
                <div className="bg-[#111] border border-[#00ff41]/30 rounded-2xl p-8 shadow-2xl cyber-border">
                  <div className="flex flex-col items-center mb-8">
                    <div className="p-4 bg-[#00ff41]/10 rounded-full border border-[#00ff41]/30 mb-4">
                      <Lock className="w-10 h-10 text-[#00ff41]" />
                    </div>
                    <h2 className="text-xl font-bold uppercase tracking-tight">Admin Authentication</h2>
                    <p className="text-[10px] opacity-50 uppercase mt-1">Restricted Access Area</p>
                  </div>

                  <form onSubmit={handleAdminLogin} className="space-y-6">
                    <button 
                      type="submit"
                      disabled={isAuthenticating}
                      className="w-full bg-[#00ff41] text-black font-bold py-4 rounded-lg flex items-center justify-center gap-2 hover:bg-[#00cc34] transition-all"
                    >
                      {isAuthenticating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />}
                      {isAuthenticating ? "VERIFYING..." : "LOGIN WITH GOOGLE"}
                    </button>
                    {loginError && <p className="text-red-500 text-[10px] mt-2 font-bold uppercase text-center">{loginError}</p>}
                  </form>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="bg-[#111] border border-[#00ff41]/30 rounded-2xl p-6 cyber-border">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-2 text-sm font-bold uppercase">
                        <History className="w-5 h-5" />
                        Operation History
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={clearHistory}
                          className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/30 text-red-500 text-[10px] font-bold uppercase rounded hover:bg-red-500/20 transition-all"
                        >
                          <Trash2 className="w-3 h-3" />
                          Purge
                        </button>
                        <button 
                          onClick={handleLogout}
                          className="flex items-center gap-2 px-3 py-1.5 bg-[#00ff41]/10 border border-[#00ff41]/30 text-[#00ff41] text-[10px] font-bold uppercase rounded hover:bg-[#00ff41]/20 transition-all"
                        >
                          <LogOut className="w-3 h-3" />
                          Logout
                        </button>
                      </div>
                    </div>

                    <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 scrollbar-hide">
                      {globalHistory.length === 0 ? (
                        <div className="py-20 flex flex-col items-center justify-center opacity-20">
                          <Clock className="w-12 h-12 mb-4" />
                          <p className="uppercase tracking-widest text-xs">No Records Found</p>
                        </div>
                      ) : (
                        globalHistory.map((entry) => (
                          <div key={entry.id} className="bg-black/40 border border-[#00ff41]/10 rounded-lg p-4 flex items-center justify-between group hover:border-[#00ff41]/30 transition-all">
                            <div className="flex items-center gap-4">
                              <div className={`p-2 rounded-lg ${
                                entry.status === 'COMPLETED' ? 'bg-green-500/10 text-green-500' :
                                entry.status === 'ABORTED' ? 'bg-yellow-500/10 text-yellow-500' :
                                'bg-blue-500/10 text-blue-500'
                              }`}>
                                <Phone className="w-4 h-4" />
                              </div>
                              <div>
                                <h4 className="text-sm font-bold text-[#00ff41]">+91 {entry.phoneNumber}</h4>
                                <p className="text-[10px] opacity-40">{new Date(entry.timestamp).toLocaleString()}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className={`text-[10px] font-bold uppercase mb-1 ${
                                entry.status === 'COMPLETED' ? 'text-green-500' :
                                entry.status === 'ABORTED' ? 'text-yellow-500' :
                                'text-blue-500'
                              }`}>
                                {entry.status}
                              </div>
                              <div className="text-[9px] opacity-40 uppercase">{entry.count} Packets Sent</div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-[#111] border border-[#00ff41]/20 rounded-xl p-4">
                      <p className="text-[10px] opacity-50 uppercase mb-1">Total Operations</p>
                      <p className="text-2xl font-bold">{globalHistory.length}</p>
                    </div>
                    <div className="bg-[#111] border border-[#00ff41]/20 rounded-xl p-4">
                      <p className="text-[10px] opacity-50 uppercase mb-1">Success Rate</p>
                      <p className="text-2xl font-bold">
                        {globalHistory.length > 0 
                          ? Math.round((globalHistory.filter(h => h.status === 'COMPLETED').length / globalHistory.length) * 100) 
                          : 0}%
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'settings' && (
            <motion.div
              key="settings-tab"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="w-full max-w-2xl mx-auto"
            >
              <div className="space-y-6">
                <div className="bg-[#111] border border-[#00ff41]/30 rounded-2xl p-6 cyber-border">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2 text-sm font-bold uppercase">
                      <Settings className="w-5 h-5" />
                      API Key Management
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="p-4 bg-black/50 border border-[#00ff41]/20 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 text-xs uppercase font-bold">
                          <Key className="w-4 h-4" />
                          External Gateway API Key
                        </div>
                        <div className={`text-[10px] uppercase font-bold px-2 py-1 rounded ${(import.meta as any).env.VITE_EXTERNAL_GATEWAY_KEY ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>
                          {(import.meta as any).env.VITE_EXTERNAL_GATEWAY_KEY ? 'Connected' : 'Disconnected'}
                        </div>
                      </div>
                      <p className="text-[10px] opacity-60 leading-relaxed mb-4">
                        Required for connecting to external SMS/Call gateways for live network penetration testing.
                      </p>
                      {!(import.meta as any).env.VITE_EXTERNAL_GATEWAY_KEY && (
                        <div className="text-[10px] bg-[#00ff41]/5 border border-[#00ff41]/20 p-3 rounded text-[#00ff41]/80">
                          To configure this key:
                          <ol className="list-decimal ml-4 mt-2 space-y-1">
                            <li>Open the <strong>Settings</strong> (⚙️ gear icon, top-right corner)</li>
                            <li>Select <strong>Secrets</strong></li>
                            <li>Add a new secret named <code>VITE_EXTERNAL_GATEWAY_KEY</code></li>
                            <li>Paste your API key and press Enter</li>
                          </ol>
                        </div>
                      )}
                    </div>

                    <div className="p-4 bg-black/50 border border-[#00ff41]/20 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 text-xs uppercase font-bold">
                          <Wifi className="w-4 h-4" />
                          Proxy Network API Key
                        </div>
                        <div className={`text-[10px] uppercase font-bold px-2 py-1 rounded ${(import.meta as any).env.VITE_PROXY_NETWORK_KEY ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>
                          {(import.meta as any).env.VITE_PROXY_NETWORK_KEY ? 'Connected' : 'Disconnected'}
                        </div>
                      </div>
                      <p className="text-[10px] opacity-60 leading-relaxed mb-4">
                        Required for advanced proxy network routing to obfuscate origin signals.
                      </p>
                      {!(import.meta as any).env.VITE_PROXY_NETWORK_KEY && (
                        <div className="text-[10px] bg-[#00ff41]/5 border border-[#00ff41]/20 p-3 rounded text-[#00ff41]/80">
                          To configure this key:
                          <ol className="list-decimal ml-4 mt-2 space-y-1">
                            <li>Open the <strong>Settings</strong> (⚙️ gear icon, top-right corner)</li>
                            <li>Select <strong>Secrets</strong></li>
                            <li>Add a new secret named <code>VITE_PROXY_NETWORK_KEY</code></li>
                            <li>Paste your API key and press Enter</li>
                          </ol>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer Warning */}
        <div className="mt-8 flex items-center gap-4 bg-red-500/5 border border-red-500/20 p-4 rounded-lg">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-[10px] text-red-500/80 uppercase leading-relaxed">
            Warning: This tool is for educational and simulation purposes only. Unauthorized stress testing of communication networks may violate local regulations. Use responsibly.
          </p>
        </div>
      </motion.div>

      {/* Decorative Corner Elements */}
      <div className="fixed top-4 left-4 w-12 h-12 border-t-2 border-l-2 border-[#00ff41]/20" />
      <div className="fixed top-4 right-4 w-12 h-12 border-t-2 border-r-2 border-[#00ff41]/20" />
      <div className="fixed bottom-4 left-4 w-12 h-12 border-b-2 border-l-2 border-[#00ff41]/20" />
      <div className="fixed bottom-4 right-4 w-12 h-12 border-b-2 border-r-2 border-[#00ff41]/20" />

      {/* Notifications Overlay */}
      <div className="fixed top-24 right-8 z-[110] flex flex-col gap-3 pointer-events-none">
        <AnimatePresence>
          {notifications.map((n) => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.9 }}
              className={`px-6 py-3 rounded-lg border shadow-2xl flex items-center gap-3 backdrop-blur-md ${
                n.type === 'success' ? 'bg-green-500/20 border-green-500/50 text-green-400' :
                n.type === 'error' ? 'bg-red-500/20 border-red-500/50 text-red-400' :
                n.type === 'warning' ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400' :
                'bg-[#111]/80 border-[#00ff41]/30 text-[#00ff41]'
              }`}
            >
              <div className={`w-2 h-2 rounded-full animate-pulse ${
                n.type === 'success' ? 'bg-green-400' :
                n.type === 'error' ? 'bg-red-400' :
                n.type === 'warning' ? 'bg-yellow-400' :
                'bg-[#00ff41]'
              }`} />
              <span className="text-xs font-bold uppercase tracking-widest">{n.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function StatusItem({ label, value, icon, status = 'normal' }: { label: string, value: string, icon: React.ReactNode, status?: 'normal' | 'warning' | 'error' }) {
  const colorClass = 
    status === 'warning' ? 'bg-yellow-400 shadow-[0_0_5px_rgba(250,204,21,0.8)]' :
    status === 'error' ? 'bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.8)]' :
    'bg-[#00ff41] shadow-[0_0_5px_rgba(0,255,65,0.8)]';

  const textColorClass = 
    status === 'warning' ? 'text-yellow-400' :
    status === 'error' ? 'text-red-500' :
    'text-[#00ff41]';

  return (
    <div className="flex items-center justify-between text-[10px] uppercase">
      <div className="flex items-center gap-2 opacity-60">
        {icon}
        {label}
      </div>
      <div className="flex items-center gap-2">
        <span className={`font-bold ${textColorClass}`}>{value}</span>
        <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${colorClass}`} />
      </div>
    </div>
  );
}
