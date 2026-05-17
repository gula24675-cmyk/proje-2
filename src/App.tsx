import { GoogleGenAI, Type } from "@google/genai";
import { motion, AnimatePresence } from "motion/react";
import React, { useState, useEffect, useRef } from "react";
import { 
  Plus, Trash2, Calendar, Clock, Coffee, AlertCircle, 
  Loader2, CheckCircle2, Bell, BellOff, Settings2, 
  Volume2, VolumeX, ExternalLink, Play, Check,
  ArrowUp, ArrowDown, Utensils, User as UserIcon, LogOut, Mail, Lock, Phone, UserCircle
} from "lucide-react";
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  User as FirebaseUser
} from "firebase/auth";
import { 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs,
  orderBy,
  serverTimestamp,
  getDocFromServer
} from "firebase/firestore";
import { auth, db } from "./firebase";

const googleProvider = new GoogleAuthProvider();

// --- Types ---

interface Task {
  id: string;
  text: string;
  startTime: string;
  endTime: string;
  notificationsEnabled: boolean;
}

interface PlanItem {
  id: string;
  time: string;
  activity: string;
  duration: number;
  type: "work" | "break" | "transition" | "meal";
  timestamp?: number;
}

interface ArchivedPlan {
  id: string;
  userId: string;
  date: string;
  plan: PlanItem[];
  tasks: Task[];
  createdAt: any;
}

interface UserProfile {
  uid: string;
  username: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
  theme?: string;
}

const THEMES = {
  default: {
    id: "default",
    name: "Okyanus",
    color: "#3B82F6",
    bg: "rgba(59, 130, 246, 0.1)",
    border: "rgba(59, 130, 246, 0.2)",
    text: "text-blue-400",
    glow: "rgba(59, 130, 246, 0.15)"
  },
  emerald: {
    id: "emerald",
    name: "Zümrüt",
    color: "#10B981",
    bg: "rgba(16, 185, 129, 0.1)",
    border: "rgba(16, 185, 129, 0.2)",
    text: "text-emerald-400",
    glow: "rgba(16, 185, 129, 0.15)"
  },
  rose: {
    id: "rose",
    name: "Gül",
    color: "#F43F5E",
    bg: "rgba(244, 63, 94, 0.1)",
    border: "rgba(244, 63, 94, 0.2)",
    text: "text-rose-400",
    glow: "rgba(244, 63, 94, 0.15)"
  },
  amber: {
    id: "amber",
    name: "Kehribar",
    color: "#F59E0B",
    bg: "rgba(245, 158, 11, 0.1)",
    border: "rgba(245, 158, 11, 0.2)",
    text: "text-amber-400",
    glow: "rgba(245, 158, 11, 0.15)"
  },
  purple: {
    id: "purple",
    name: "Mor",
    color: "#8B5CF6",
    bg: "rgba(139, 92, 246, 0.1)",
    border: "rgba(139, 92, 246, 0.2)",
    text: "text-purple-400",
    glow: "rgba(139, 92, 246, 0.15)"
  }
};

const AVATARS = [
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Lucas&mouth=smile&backgroundColor=b6e3f4",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka&mouth=smile&backgroundColor=c0aede",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Jack&mouth=smile&backgroundColor=ffdfbf",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Luna&mouth=smile&backgroundColor=ffd5dc",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Milo&mouth=smile&backgroundColor=d1d4f9",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Maya&mouth=smile&backgroundColor=ffdfbf",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Leo&mouth=smile&backgroundColor=b6e3f4",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Bella&mouth=smile&backgroundColor=c0aede",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Sophia&mouth=smile&backgroundColor=ffd5dc",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Oliver&mouth=smile&backgroundColor=d1d4f9",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Emma&mouth=smile&backgroundColor=ffdfbf",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=William&mouth=smile&backgroundColor=b6e3f4",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Isabella&mouth=smile&backgroundColor=ffd5dc",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Noah&mouth=smile&backgroundColor=d1d4f9",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=Mia&mouth=smile&backgroundColor=ffdfbf",
  "https://api.dicebear.com/7.x/avataaars/svg?seed=James&mouth=smile&backgroundColor=b6e3f4"
];

// --- AI Initialization ---

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// --- Components ---

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authLoading, setAuthLoading] = useState(true);
  const [currentTheme, setCurrentTheme] = useState<keyof typeof THEMES>('default');

  useEffect(() => {
    if (profile?.theme && profile.theme in THEMES) {
      setCurrentTheme(profile.theme as keyof typeof THEMES);
    }
  }, [profile]);

  // Firestore specific error handler
  const handleFirestoreError = (error: unknown, operationType: string, path: string | null) => {
    const errInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        emailVerified: auth.currentUser?.emailVerified,
      },
      operationType,
      path
    };
    console.error('Firestore Error: ', JSON.stringify(errInfo));
    throw new Error(JSON.stringify(errInfo));
  };

  // Validate Connection to Firestore
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();
  }, []);

  // Listen for auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (userDoc.exists()) {
            setProfile(userDoc.data() as UserProfile);
          }
          fetchHistory(user.uid);
        } catch (err) {
          console.error("Profile load error:", err);
        }
      } else {
        setProfile(null);
        setHistory([]);
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTaskText, setNewTaskText] = useState("");
  const [newTaskStartTime, setNewTaskStartTime] = useState("08:00");
  const [newTaskEndTime, setNewTaskEndTime] = useState("09:00");
  const [newTaskNotif, setNewTaskNotif] = useState(true);
  const [plan, setPlan] = useState<PlanItem[] | null>(null);
  const [history, setHistory] = useState<ArchivedPlan[]>([]);
  const [viewingHistoryId, setViewingHistoryId] = useState<string | null>(null);
  const [showHistoryList, setShowHistoryList] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeToasts, setActiveToasts] = useState<{id: string, title: string, message: string}[]>([]);

  // Function to show on-screen toast
  const showToast = (title: string, message: string) => {
    const id = Math.random().toString(36).substr(2, 9);
    setActiveToasts(prev => [...prev, { id, title, message }]);
    setTimeout(() => {
      setActiveToasts(prev => prev.filter(t => t.id !== id));
    }, 10000);
  };

  const fetchHistory = async (userId: string) => {
    try {
      const q = query(
        collection(db, "plans"), 
        where("userId", "==", userId),
        orderBy("createdAt", "desc")
      );
      const querySnapshot = await getDocs(q);
      const historyData: ArchivedPlan[] = [];
      querySnapshot.forEach((doc) => {
        historyData.push({ id: doc.id, ...doc.data() } as ArchivedPlan);
      });
      setHistory(historyData);
    } catch (err) {
      console.error("History fetch error:", err);
    }
  };

  const [authFormData, setAuthFormData] = useState({
    email: '',
    password: '',
    username: '',
    phone: ''
  });
  const [authError, setAuthError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setAuthError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      // Check if profile exists
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (!userDoc.exists()) {
        const userProfile: UserProfile = {
          uid: user.uid,
          username: user.displayName || user.email?.split('@')[0] || "Kullanıcı",
          email: user.email || "",
          avatarUrl: user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`
        };
        await setDoc(doc(db, "users", user.uid), userProfile);
        setProfile(userProfile);
      }
      setShowAuthModal(false);
      showToast("Giriş Başarılı", "Google ile giriş yaptınız.");
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/popup-closed-by-user') {
        setAuthError("Giriş penceresi kapatıldı.");
      } else {
        setAuthError("Google ile giriş yapılamadı. Tarayıcınızın pop-up'lara izin verdiğinden emin olun.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setAuthError(null);
    try {
      const { email, password, username, phone } = authFormData;
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const newUser = userCredential.user;
      
      const userProfile: UserProfile = {
        uid: newUser.uid,
        username,
        email,
        phone,
        avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`
      };
      
      await setDoc(doc(db, "users", newUser.uid), userProfile);
      setProfile(userProfile);
      setShowAuthModal(false);
      showToast("Kayıt Başarılı", `Hoş geldin, ${username}!`);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/operation-not-allowed') {
        const projectId = auth.config.apiKey ? "mevcut-projeniz" : ""; 
        setAuthError(
          "E-posta/Şifre girişi Firebase panelinden kapalı. \n\n" +
          "Düzeltmek için: Firebase Konsolu > Authentication > Sign-in method sekmesinden 'Email/Password'u etkinleştirin."
        );
      } else if (err.code === 'auth/network-request-failed') {
        setAuthError("İnternet bağlantısı veya Firebase yapılandırma hatası. Google ile Giriş yapmayı deneyin.");
      } else {
        setAuthError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setAuthError(null);
    try {
      const { email, password } = authFormData;
      await signInWithEmailAndPassword(auth, email, password);
      setShowAuthModal(false);
      showToast("Giriş Yapıldı", "Başarıyla giriş yaptınız.");
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/operation-not-allowed') {
        setAuthError("E-posta/Şifre girişi henüz etkinleştirilmemiş. Google ile Giriş yapabilirsiniz.");
      } else if (err.code === 'auth/network-request-failed') {
        setAuthError("Ağ bağlantısı hatası. Lütfen internetinizi kontrol edin.");
      } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setAuthError("E-posta veya şifre hatalı.");
      } else {
        setAuthError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleProfileUpdate = async (updates: Partial<UserProfile>) => {
    if (!user) return;
    setLoading(true);
    try {
      const newProfile = { ...profile, ...updates } as UserProfile;
      await setDoc(doc(db, "users", user.uid), newProfile, { merge: true });
      setProfile(newProfile);
      showToast("Profil Güncellendi", "Değişiklikler başarıyla kaydedildi.");
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, "update", "users");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setPlan(null);
      setTasks([]);
      setHistory([]);
      showToast("Çıkış Yapıldı", "Tekrar görüşmek üzere!");
    } catch (err) {
      console.error(err);
    }
  };
  
  // Custom Interval Settings
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("17:00");
  
  // Notification & Audio Settings
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize Notification Permission
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotificationsEnabled(Notification.permission === "granted");
    }
  }, []);

  const requestNotificationPermission = async () => {
    if (typeof window !== "undefined" && "Notification" in window) {
      try {
        const permission = await Notification.requestPermission();
        setNotificationsEnabled(permission === "granted");
        
        if (permission === 'denied') {
          setError("Bildirim izni reddedildi. Lütfen tarayıcı ayarlarından izin verin.");
        } else if (permission === 'granted') {
          setError(null);
          // Test notification
          sendNotification("Bildirimler Aktif!", "Planlanan zamanlarda size hatırlatma yapacağız.");
        }
      } catch (err) {
        console.error("Notification permission error:", err);
        setError("Bildirim izni istenirken bir hata oluştu.");
      }
    } else {
      setError("Tarayıcınız bildirimleri desteklemiyor.");
    }
  };

  const playAlarm = () => {
    if (audioEnabled && audioRef.current) {
      audioRef.current.play().catch(() => {
        // User interaction might be required first
        console.warn("Audio playback delayed until user interaction");
      });
    }
  };

  const sendNotification = (title: string, body: string) => {
    if (notificationsEnabled) {
      new Notification(title, { body, icon: "/favicon.ico" });
    }
    playAlarm();
  };

  // Alarm Check Logic
  useEffect(() => {
    const checkSchedule = () => {
      if (!plan) return;
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      plan.forEach(item => {
        const matches = item.time.match(/(\d+):(\d+)/);
        if (!matches) return;
        
        const hours = parseInt(matches[1], 10);
        const minutes = parseInt(matches[2], 10);
        
        const itemMinutes = hours * 60 + minutes;

        // Check if current time matches the exact start time of an activity
        if (itemMinutes === currentMinutes && now.getSeconds() === 0) {
          // Find the related task to check if notification is enabled for this specific task
          const task = tasks.find(t => t.text === item.activity && t.startTime === item.time);
          
          if (task && task.notificationsEnabled) {
            sendNotification(
              item.type === 'work' ? "Görev Başladı" : "Mola Vakti!",
              `${item.activity} (${item.duration} dk)`
            );
            showToast(
              item.type === 'work' ? "GÖREV VAKTİ" : "MOLA VAKTİ",
              `${item.activity} süresi başladı (${item.duration} dk)`
            );
          }
        }
      });
    };

    const interval = setInterval(checkSchedule, 1000);
    return () => clearInterval(interval);
  }, [plan, tasks, notificationsEnabled, audioEnabled]);

  const addTask = () => {
    if (!newTaskText.trim()) return;
    const newTask: Task = {
      id: Math.random().toString(36).substr(2, 9),
      text: newTaskText,
      startTime: newTaskStartTime,
      endTime: newTaskEndTime,
      notificationsEnabled: newTaskNotif,
    };
    setTasks([...tasks, newTask]);
    setNewTaskText("");
    // Automatically set next task start time to current task end time
    setNewTaskStartTime(newTaskEndTime);
    // Suggest a 1 hour window for the next one
    const [h, m] = newTaskEndTime.split(':').map(Number);
    const nextH = (h + 1) % 24;
    setNewTaskEndTime(`${nextH.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
  };

  const removeTask = (id: string) => {
    setTasks(tasks.filter((t) => t.id !== id));
  };

  const toggleTaskNotif = (id: string) => {
    if (!notificationsEnabled) {
      requestNotificationPermission();
    }
    setTasks(tasks.map(t => t.id === id ? { ...t, notificationsEnabled: !t.notificationsEnabled } : t));
  };

  const generatePlan = async () => {
    if (tasks.length === 0) {
      setError("Lütfen en az bir görev ekleyin.");
      return;
    }

    setLoading(true);
    setError(null);
    setPlan(null);

    try {
      const taskListString = tasks
        .map((t) => `- ${t.text} (${t.startTime} - ${t.endTime})`)
        .join("\n");

      const prompt = `Bugün için şu görevlerim var:\n${taskListString}\n\nLütfen şu KESİN kurallara uyarak günlük plan oluştur:\n1. ZAMAN UYUMU: Görevlerin yanında belirttiğim (START - END) zamanlarına KESİNLİKLE uy.\n2. SADECE VERİLENLER: Plana SADECE yukarıdaki listede bulunan görevleri dahil et. \n3. OTOMATİK EKLEME YASAK: KENDİLİĞİNDEN mola (break), yemek (meal) veya başka bir aktivite ASLA EKLEME. Sadece benim verdiğim görevleri çizelgeye yaz.\n4. FORMAT: HH:MM formatını kullan.\n5. DİL: Türkçe.\n6. Çıktı: activity, duration (dakika farkı), time (HH:MM Start), type ("work" olarak işaretle) içeren JSON dizisi.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                h2: { type: Type.STRING, description: "Gereksiz alan" },
                time: { type: Type.STRING, description: "Başlangıç saati (HH:MM)" },
                activity: { type: Type.STRING, description: "Görevin veya molanın adı" },
                duration: { type: Type.NUMBER, description: "Dakika cinsinden süre" },
                type: { 
                  type: Type.STRING, 
                  enum: ["work", "break", "transition", "meal"],
                  description: "Aktivite tipi"
                }
              },
              required: ["time", "activity", "duration", "type"]
            }
          }
        }
      });

      const result = JSON.parse(response.text || "[]").map((item: any) => ({
        ...item,
        id: Math.random().toString(36).substr(2, 9)
      }));
      setPlan(result);
    } catch (err) {
      console.error(err);
      setError("Plan oluşturulamadı. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  };

  const removePlanItem = (id: string) => {
    if (plan) {
      setPlan(plan.filter(item => item.id !== id));
    }
  };

  const movePlanItem = (index: number, direction: 'up' | 'down') => {
    if (!plan) return;
    const newPlan = [...plan];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (targetIndex >= 0 && targetIndex < newPlan.length) {
      const temp = newPlan[index];
      newPlan[index] = newPlan[targetIndex];
      newPlan[targetIndex] = temp;
      setPlan(newPlan);
    }
  };

  const archiveCurrentPlan = async () => {
    if (!plan || plan.length === 0) return;
    if (!user) {
      setError("Planı kaydetmek için lütfen giriş yapın.");
      setShowAuthModal(true);
      return;
    }
    
    setLoading(true);
    try {
      const planData = {
        userId: user.uid,
        date: new Date().toLocaleString('tr-TR', { 
          year: 'numeric', month: 'long', day: 'numeric', 
          hour: '2-digit', minute: '2-digit' 
        }),
        plan: plan,
        tasks: tasks,
        createdAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, "plans"), planData);
      
      // Update local history state
      const newHistoryEntry: ArchivedPlan = {
        id: docRef.id,
        ...planData,
        createdAt: new Date()
      };
      setHistory(prev => [newHistoryEntry, ...prev]);
      setSuccessMessage("Plan buluta başarıyla kaydedildi!");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error(err);
      setError("Plan kaydedilirken bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  const viewArchivedPlan = (id: string) => {
    const entry = history.find(h => h.id === id);
    if (entry) {
      setPlan(entry.plan);
      setTasks(entry.tasks);
      setViewingHistoryId(id);
      setShowHistoryList(false);
    }
  };

  return (
    <div 
      className="min-h-screen bg-[#05070A] text-slate-100 font-sans p-6 md:p-12 overflow-x-hidden selection:bg-blue-500/30 relative"
      style={{
        '--theme-color': THEMES[currentTheme].color,
        '--theme-bg': THEMES[currentTheme].bg,
        '--theme-border': THEMES[currentTheme].border,
      } as React.CSSProperties}
    >
      {/* Dynamic Star Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(50)].map((_, i) => (
          <div 
            key={i}
            className="absolute bg-white rounded-full opacity-20 animate-pulse"
            style={{
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              width: `${Math.random() * 2 + 1}px`,
              height: `${Math.random() * 2 + 1}px`,
              animationDelay: `${Math.random() * 5}s`,
              animationDuration: `${Math.random() * 3 + 2}s`,
              backgroundColor: THEMES[currentTheme].color
            }}
          />
        ))}
        <div 
          className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] blur-[120px] rounded-full transition-all duration-1000" 
          style={{ backgroundColor: THEMES[currentTheme].glow }}
        />
        <div 
          className="absolute bottom-[-10%] left-[-10%] w-[30%] h-[30%] blur-[100px] rounded-full transition-all duration-1000" 
          style={{ backgroundColor: THEMES[currentTheme].glow }}
        />
      </div>

      {/* Invisible notification sound */}
      <audio ref={audioRef} src="https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3" preload="auto" />

      <div className="max-w-6xl mx-auto flex flex-col gap-8 relative z-10">
        
        {/* Premium SaaS Navbar */}
        <motion.header 
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="flex flex-col md:flex-row justify-between items-center gap-6 bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-[2.5rem] px-10 py-6 mb-4 shadow-2xl relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-transparent to-purple-500/5 pointer-events-none" />
          
          <div className="flex items-center gap-6 group cursor-pointer relative z-10" onClick={() => window.location.reload()}>
            {/* Professional SVG Logo */}
            <div className="relative w-12 h-12">
              <motion.div
                animate={{ 
                  filter: ["drop-shadow(0 0 8px rgba(59,130,246,0.3))", "drop-shadow(0 0 16px rgba(139,92,246,0.4))", "drop-shadow(0 0 8px rgba(59,130,246,0.3))"]
                }}
                transition={{ duration: 4, repeat: Infinity }}
              >
                <svg viewBox="0 0 100 100" className="w-full h-full transition-transform group-hover:scale-110 duration-500" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="easyDayLogoGradient" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stopColor="#3B82F6" />
                      <stop offset="100%" stopColor="#8B5CF6" />
                    </linearGradient>
                  </defs>
                  <rect x="15" y="20" width="70" height="65" rx="14" fill="white" fillOpacity="0.03" stroke="url(#easyDayLogoGradient)" strokeWidth="3" />
                  <path d="M15 42H85" stroke="url(#easyDayLogoGradient)" strokeWidth="3" strokeLinecap="round" />
                  <rect x="30" y="10" width="4" height="15" rx="2" fill="url(#easyDayLogoGradient)" />
                  <rect x="66" y="10" width="4" height="15" rx="2" fill="url(#easyDayLogoGradient)" />
                  <path d="M38 64L48 74L72 48" stroke="url(#easyDayLogoGradient)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="82" cy="80" r="9" fill="#8B5CF6" fillOpacity="0.2" className="animate-pulse" />
                  <path d="M82 74V86M76 80H88" stroke="#A78BFA" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              </motion.div>
            </div>
            
            <div className="flex flex-col">
              <h1 className="text-3xl font-black text-white tracking-tighter leading-none">
                Easy<span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400">Day</span>
              </h1>
              <div className="flex items-center gap-2 mt-1.5 overflow-hidden h-3">
                <motion.div 
                  initial={{ x: -20 }}
                  animate={{ x: 0 }}
                  className="h-0.5 w-6 rounded-full bg-gradient-to-r from-blue-500 to-purple-500" 
                />
                <span className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-500 whitespace-nowrap">AI Productivity v2.5</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4 relative z-10">
            <button 
              onClick={() => setShowHistoryList(true)}
              className="flex items-center gap-2.5 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-white/5 bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all active:scale-95 group"
            >
              <Calendar className="w-3.5 h-3.5 group-hover:rotate-12 transition-transform" />
              <span>Geçmiş</span>
              <span className="bg-white/10 px-2 py-0.5 rounded-md text-blue-400 ml-1">{history.length}</span>
            </button>
            
            <div className="h-8 w-px bg-white/10 mx-1 hidden sm:block" />

            {user ? (
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setShowProfileModal(true)}
                  className="flex items-center gap-3 pl-2 pr-5 py-2 rounded-2xl border border-white/5 bg-white/5 hover:bg-white/10 hover:border-white/20 transition-all group relative overflow-hidden"
                >
                  <div className="relative">
                    <img 
                      src={profile?.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.email}`} 
                      alt="avatar" 
                      className="w-9 h-9 rounded-xl ring-1 ring-white/10 group-hover:ring-blue-500/50 transition-all object-cover" 
                    />
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-[#0D1117] rounded-full" />
                  </div>
                  <div className="flex flex-col items-start">
                    <span className="text-[10px] font-black text-white uppercase tracking-wider">{profile?.username || user.email?.split('@')[0]}</span>
                  </div>
                </button>

                <button 
                  onClick={handleLogout}
                  className="p-3 rounded-2xl border border-white/5 bg-white/5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/20 transition-all active:scale-90"
                  title="Çıkış Yap"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button 
                onClick={() => {
                  setAuthMode('login');
                  setShowAuthModal(true);
                }}
                className="group relative flex items-center gap-3 px-8 py-3.5 rounded-2xl bg-white text-slate-900 font-black text-[10px] uppercase tracking-widest hover:bg-blue-50 hover:scale-[1.02] transition-all shadow-xl shadow-blue-500/10"
              >
                <UserIcon className="w-4 h-4" />
                <span>Hesap Oluştur</span>
              </button>
            )}

            <button 
              id="toggle_audio_btn"
              onClick={() => setAudioEnabled(!audioEnabled)}
              className="p-3 rounded-2xl bg-white/5 border border-white/5 text-slate-400 hover:text-white hover:bg-white/10 hover:border-white/10 transition-all"
            >
              {audioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
          </div>
        </motion.header>

        <main className="grid grid-cols-1 md:grid-cols-12 gap-8">
          
          {/* Left Sidebar: Analysis & Controls */}
          <aside className="md:col-span-4 flex flex-col gap-6">
            
            {/* Task Analyzer Section */}
            <section className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 p-6 shadow-2xl flex flex-col gap-6" id="entry_panel">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" style={{ color: THEMES[currentTheme].color }} />
                    Görev Girişi
                  </h2>
                  {tasks.length > 0 && (
                    <button 
                      onClick={() => setTasks([])}
                      className="text-[9px] font-black uppercase tracking-widest text-red-400/60 hover:text-red-400 transition-colors flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      Temizle
                    </button>
                  )}
                </div>
                
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-2">
                    <div className="relative">
                      <input
                        id="task_input"
                        type="text"
                        value={newTaskText}
                        onChange={(e) => setNewTaskText(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && addTask()}
                        placeholder="Görev adı..."
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all font-medium text-white placeholder:text-slate-600"
                      />
                    </div>
                    <div className="flex gap-2">
                       <div className="flex-1 relative">
                        <input
                          type="time"
                          value={newTaskStartTime}
                          onChange={(e) => setNewTaskStartTime(e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all font-mono text-center text-blue-400 font-bold"
                        />
                        <span className="absolute -top-2 left-2 px-1 bg-[#05070A] text-[8px] font-black text-slate-500 uppercase tracking-widest">Başla</span>
                      </div>
                      <div className="flex-1 relative">
                        <input
                          type="time"
                          value={newTaskEndTime}
                          onChange={(e) => setNewTaskEndTime(e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all font-mono text-center text-emerald-400 font-bold"
                        />
                        <span className="absolute -top-2 left-2 px-1 bg-[#05070A] text-[8px] font-black text-slate-500 uppercase tracking-widest">Bitiş</span>
                      </div>
                      <button 
                        onClick={() => {
                          if (!notificationsEnabled && !newTaskNotif) requestNotificationPermission();
                          setNewTaskNotif(!newTaskNotif);
                        }}
                        className={`px-4 rounded-xl border transition-all flex items-center justify-center ${
                          newTaskNotif 
                          ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' 
                          : 'bg-white/5 border-white/10 text-slate-600'
                        }`}
                        title="Bildirimleri Aç/Kapat"
                      >
                        <Bell className={`w-4 h-4 ${newTaskNotif ? 'fill-blue-400/20' : ''}`} />
                      </button>
                    </div>
                  </div>
                  <button
                    id="add_task_btn"
                    onClick={addTask}
                    style={{ backgroundColor: THEMES[currentTheme].color }}
                    className="w-full hover:opacity-90 text-white py-3.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all shadow-lg flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Görev Ekle
                  </button>
                </div>
              </div>


              {/* Analyzed Task List */}
              <div className="space-y-3 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar" id="task_list">
                <AnimatePresence mode="popLayout">
                  {tasks.map((task) => (
                    <motion.div
                      key={task.id}
                      layout
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="flex items-center justify-between group p-2 bg-white/5 rounded-xl border border-transparent hover:border-white/10 transition-all"
                    >
                      <div className="flex items-start gap-3 flex-1 overflow-hidden">
                        <div className="w-1.5 h-1.5 rounded-full mt-2 shrink-0" style={{ backgroundColor: THEMES[currentTheme].color, boxShadow: `0 0 8px ${THEMES[currentTheme].color}` }} />
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-slate-200 leading-tight truncate">{task.text}</span>
                          <span className={`text-[10px] font-bold opacity-80 ${THEMES[currentTheme].text}`}>{task.startTime} - {task.endTime}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => toggleTaskNotif(task.id)}
                          className={`p-2 rounded-lg transition-all ${
                            task.notificationsEnabled 
                            ? `${THEMES[currentTheme].text} bg-white/5` 
                            : 'text-slate-600 hover:text-slate-400 hover:bg-white/5'
                          }`}
                          title="Bildirimi aç/kapat"
                        >
                          <Bell className={`w-3.5 h-3.5 ${task.notificationsEnabled ? 'fill-blue-400/20' : ''}`} />
                        </button>
                        <button
                          onClick={() => removeTask(task.id)}
                          className="opacity-0 group-hover:opacity-100 p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {tasks.length === 0 && (
                  <div className="py-8 text-center border-2 border-dashed border-white/5 rounded-3xl" id="empty_list_state">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Görev Bekleniyor</p>
                  </div>
                )}
              </div>

              <button
                id="generate_plan_btn"
                onClick={generatePlan}
                disabled={loading || tasks.length === 0}
                className={`w-full py-4 rounded-xl font-black text-xs uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 ${
                  loading || tasks.length === 0
                    ? "bg-white/5 text-slate-600 cursor-not-allowed"
                    : "bg-white text-slate-900 hover:bg-slate-200 shadow-xl shadow-white/10"
                }`}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin text-blue-500" /> : <Play className="w-4 h-4 fill-current" />}
                {loading ? "Hesaplanıyor..." : "Programı Oluştur"}
              </button>
            </section>

            {/* Program Ayarları */}
            <section className="bg-[#0D1117] text-white rounded-3xl p-6 shadow-2xl flex flex-col gap-6 border border-white/10" id="settings_panel">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                <Settings2 className="w-4 h-4" style={{ color: THEMES[currentTheme].color }} />
                Günün Zaman Aralığı
              </h2>
              
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Genel Başlangıç</label>
                    <input 
                      type="time" 
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Genel Bitiş</label>
                    <input 
                      type="time" 
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-white/5">
                  <p className="text-[9px] text-slate-500 leading-relaxed font-bold uppercase tracking-[0.05em]">
                    Yukarıdaki zamanlar, gününüzün genel çerçevesini belirler. Görevlerinizi bu aralığa göre planlayabilirsiniz.
                  </p>
                </div>
              </div>
            </section>
          </aside>

          {/* Right Section: Schedule Waterfall */}
          <section className="md:col-span-8 bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 shadow-sm overflow-hidden flex flex-col min-h-[600px]" id="schedule_panel">
             <div className="bg-white/5 border-b border-white/10 px-8 py-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                    {viewingHistoryId ? `Arşivlenmiş Kayıt: ${history.find(h => h.id === viewingHistoryId)?.date}` : 'Canlı Zaman Çizelgesi'}
                  </span>
                  {viewingHistoryId && (
                    <button 
                      onClick={() => {
                        setViewingHistoryId(null);
                        setPlan(null);
                        setTasks([]);
                      }}
                      className="text-[9px] font-bold text-blue-400 hover:text-blue-300 uppercase tracking-widest"
                    >
                      Yeni Plan
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-bold text-slate-500 italic">{startTime} Başlangıç</span>
                </div>
             </div>

             <div className="p-8 flex-1 relative custom-scrollbar overflow-y-auto" id="timeline_container">
                {!plan ? (
                  <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center animate-pulse">
                      <Clock className="w-8 h-8 text-slate-700" />
                    </div>
                    <p className="text-xs font-bold text-slate-600 uppercase tracking-[0.15em]">Program Bekleniyor</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <AnimatePresence>
                      {plan.map((item, index) => (
                        <motion.div
                          key={item.id}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.03 }}
                          className="flex gap-6 group"
                        >
                          <div className="w-16 pt-3 flex flex-col items-end shrink-0">
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="text-[11px] font-black text-slate-400 font-mono tracking-tighter tabular-nums leading-none">
                                  {item.time}
                              </span>
                            </div>
                            
                            <div className="w-px h-8 bg-blue-500/20 my-1.5 mr-2" />
                            
                            <div className="flex flex-col items-end gap-0.5 opacity-50">
                              <span className="text-[10px] font-bold text-slate-600 font-mono tracking-tighter tabular-nums leading-none">
                                {(() => {
                                  const [h, m] = item.time.split(':').map(Number);
                                  if (isNaN(h) || isNaN(m)) return "";
                                  const totalMinutes = h * 60 + m + item.duration;
                                  const endH = Math.floor(totalMinutes / 60) % 24;
                                  const endM = totalMinutes % 60;
                                  return `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
                                })()}
                              </span>
                            </div>
                          </div>

                          <div className={`flex-1 rounded-2xl p-4 transition-all border relative group/item ${
                            item.type === 'work' 
                              ? 'bg-white/5 border-white/5 hover:border-white/20 hover:bg-white/10 shadow-lg shadow-black/20' 
                              : 'bg-transparent border-transparent'
                          }`}>
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center justify-between">
                                <span className={`text-[9px] font-black uppercase tracking-widest ${
                                  item.type === 'work' ? THEMES[currentTheme].text : 
                                  item.type === 'meal' ? 'text-orange-400' : 'text-emerald-400'
                                }`}>
                                  {item.type === 'work' ? 'ODAK BLOK' : 
                                   item.type === 'meal' ? 'BESLENME ARASI' : 'Geri Kazanım PENCERESİ'}
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-bold text-slate-500 font-mono mr-2">
                                    {item.duration} dk
                                  </span>
                                  <div className="flex bg-white/5 p-0.5 rounded-lg border border-white/5">
                                    <button
                                      disabled={index === 0}
                                      onClick={() => movePlanItem(index, 'up')}
                                      className={`p-1 rounded transition-all ${index === 0 ? 'text-slate-700' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}
                                    >
                                      <ArrowUp className="w-3 h-3" />
                                    </button>
                                    <button
                                      disabled={index === plan.length - 1}
                                      onClick={() => movePlanItem(index, 'down')}
                                      className={`p-1 rounded transition-all ${index === plan.length - 1 ? 'text-slate-700' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}
                                    >
                                      <ArrowDown className="w-3 h-3" />
                                    </button>
                                  </div>
                                  <button
                                    onClick={() => removePlanItem(item.id)}
                                    className="p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                                    title="Plandan kaldır"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                              <h3 className={`text-sm font-bold ${
                                item.type === 'break' ? 'text-slate-500 italic font-medium' : 'text-white uppercase tracking-tight'
                              }`}>
                                {item.activity}
                              </h3>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}
             </div>

             {plan && !viewingHistoryId && (
                <div className="p-6 bg-white/5 border-t border-white/10 flex flex-wrap gap-4" id="action_footer">
                   <button 
                    onClick={archiveCurrentPlan}
                    className="flex-1 bg-white/5 border border-white/10 text-white font-black text-[10px] py-4 rounded-xl uppercase tracking-[0.2em] hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                   >
                     <ExternalLink className="w-3.5 h-3.5" />
                     Arşive Kaydet
                   </button>
                   <button 
                     onClick={generatePlan}
                     className="flex-1 bg-transparent border border-white/10 text-slate-300 font-black text-[10px] py-4 rounded-xl uppercase tracking-[0.2em] hover:bg-white/5 transition-all"
                   >
                     Yenile
                   </button>
                </div>
              )}
          </section>
        </main>

        <footer className="flex flex-col sm:flex-row justify-between items-center pt-8 border-t border-white/10 gap-4">
              <div className="flex items-center gap-6 text-slate-500">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.5)]" style={{ backgroundColor: THEMES[currentTheme].color }} />
                <span className="text-[9px] font-black uppercase tracking-widest">Aktif Çalışma</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                <span className="text-[9px] font-black uppercase tracking-widest">Geri Kazanım</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.5)]" />
                <span className="text-[9px] font-black uppercase tracking-widest">Yemek Molası</span>
              </div>
           </div>
           <p className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">Focusflow Motoru v2.5 • AIS Altyapısı</p>
        </footer>
      </div>
      
      {/* Profile Settings Modal */}
      <AnimatePresence>
        {showProfileModal && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-[#05070A]/90 backdrop-blur-lg">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#0D1117] border border-white/10 w-full max-w-xl rounded-[2.5rem] overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            >
              <div className="p-8 border-b border-white/10 flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-black text-white uppercase tracking-tight">Profil Ayarları</h2>
                  <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1">Kendi tarzını yansıt</p>
                </div>
                <button 
                  onClick={() => setShowProfileModal(false)}
                  className="p-2 hover:bg-white/5 rounded-xl transition-all"
                >
                  <Plus className="w-6 h-6 rotate-45 text-slate-500" />
                </button>
              </div>

              <div className="p-8 overflow-y-auto custom-scrollbar space-y-8">
                {/* Avatar Selection */}
                <div className="space-y-4">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                    <UserCircle className="w-4 h-4 text-blue-400" />
                    Profil Resmi Seç
                  </h3>
                  <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
                    {AVATARS.map((url, i) => (
                      <button
                        key={i}
                        onClick={() => handleProfileUpdate({ avatarUrl: url })}
                        className={`relative group rounded-full overflow-hidden aspect-square border-2 transition-all ${
                          profile?.avatarUrl === url ? 'border-blue-500 p-0.5' : 'border-transparent'
                        }`}
                      >
                        <img src={url} alt={`avatar-${i}`} className="w-full h-full rounded-full" />
                        {profile?.avatarUrl === url && (
                          <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center">
                            <Check className="w-4 h-4 text-white" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-all" />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Theme Selection */}
                <div className="space-y-4">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                    <Settings2 className="w-4 h-4 text-emerald-400" />
                    Uygulama Teması
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {Object.values(THEMES).map((t) => (
                      <button
                        key={t.id}
                        onClick={() => handleProfileUpdate({ theme: t.id })}
                        className={`flex items-center gap-3 p-3 rounded-2xl border transition-all ${
                          currentTheme === t.id 
                            ? 'bg-white/10 border-blue-500/50' 
                            : 'bg-white/5 border-white/5 hover:bg-white/10'
                        }`}
                      >
                        <div className="w-4 h-4 rounded-full" style={{ backgroundColor: t.color }} />
                        <span className={`text-[10px] font-black uppercase tracking-widest ${currentTheme === t.id ? 'text-white' : 'text-slate-500'}`}>
                          {t.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Account Details */}
                <div className="pt-6 border-t border-white/5 space-y-4">
                   <div className="flex flex-col gap-1">
                      <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">E-posta Hesabı</span>
                      <span className="text-sm font-bold text-slate-300">{profile?.email}</span>
                   </div>
                   <div className="flex flex-col gap-1">
                      <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Kullanıcı Kimliği</span>
                      <span className="text-[10px] font-mono text-slate-500 truncate">{profile?.uid}</span>
                   </div>
                </div>
              </div>

              <div className="p-8 bg-white/5 border-t border-white/10 flex items-center justify-end">
                <button
                  onClick={() => setShowProfileModal(false)}
                  className="px-8 py-3 bg-white text-slate-900 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all"
                >
                  Tamamla
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {successMessage && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[110] bg-emerald-500 text-white px-6 py-3 rounded-2xl font-bold text-sm shadow-2xl flex items-center gap-3"
          >
            <CheckCircle2 className="w-5 h-5 text-white" />
            {successMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* History List Overlay */}
      <AnimatePresence>
        {showHistoryList && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-[#05070A]/80 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-[#0D1117] border border-white/10 w-full max-w-xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[80vh]"
            >
              <div className="p-6 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-blue-400" />
                  <h2 className="text-lg font-bold text-white uppercase tracking-tight">Kayıtlı Planlar</h2>
                </div>
                <button 
                  onClick={() => setShowHistoryList(false)}
                  className="p-2 hover:bg-white/5 rounded-xl transition-all"
                >
                  <Plus className="w-6 h-6 rotate-45 text-slate-500" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-3">
                {history.length === 0 ? (
                  <div className="py-12 text-center">
                    <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Arşiv Henüz Boş</p>
                  </div>
                ) : (
                  history.map((item) => (
                    <div 
                      key={item.id}
                      className="group flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-transparent hover:border-white/10 transition-all cursor-pointer"
                      onClick={() => viewArchivedPlan(item.id)}
                    >
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">{item.date}</span>
                        <span className="text-sm font-bold text-slate-200">{item.tasks.length} Görev Planlandı</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setHistory(history.filter(h => h.id !== item.id));
                          }}
                          className="p-2 text-slate-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <ArrowUp className="w-4 h-4 text-slate-600 rotate-90" />
                      </div>
                    </div>
                  ))
                )}
              </div>
              
              <div className="p-6 bg-white/5 border-t border-white/10">
                 <p className="text-[10px] text-slate-500 font-medium text-center uppercase tracking-widest">
                   Geçmiş verileri bulut hesabınızda güvenle saklanmaktadır.
                 </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Auth Modal */}
      <AnimatePresence>
        {showAuthModal && (
          <div className="fixed inset-0 z-[250] flex items-center justify-center p-6 bg-[#05070A]/90 backdrop-blur-lg">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#0D1117] border border-white/10 w-full max-w-md rounded-[2.5rem] overflow-hidden shadow-2xl relative"
            >
              <div className="p-8 pb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-black text-white uppercase tracking-tight">
                    {authMode === 'login' ? 'Tekrar Hoş Geldin' : 'Yeni Hesap Oluştur'}
                  </h2>
                  <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">
                    {authMode === 'login' ? 'Planlarını senkronize etmek için gir' : 'Verimlilik yolculuğuna bugün başla'}
                  </p>
                </div>
                <button 
                  onClick={() => setShowAuthModal(false)}
                  className="p-2 hover:bg-white/5 rounded-xl transition-all"
                >
                  <Plus className="w-6 h-6 rotate-45 text-slate-600" />
                </button>
              </div>

              <form onSubmit={authMode === 'login' ? handleLogin : handleRegister} className="p-8 pb-4 space-y-4">
                {authError && (
                  <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl flex flex-col gap-2 text-red-400 text-[11px] font-bold leading-relaxed whitespace-pre-line">
                    <div className="flex items-center gap-2">
                       <AlertCircle className="w-4 h-4 shrink-0" />
                       <span className="uppercase tracking-widest">Sistem Uyarısı</span>
                    </div>
                    <p className="opacity-90">{authError}</p>
                    {authError.includes('Email/Password') && (
                      <div className="mt-2 pt-2 border-t border-red-500/20">
                         <button 
                          type="button" 
                          onClick={handleGoogleLogin}
                          className="text-blue-400 hover:text-blue-300 underline font-black uppercase tracking-widest text-[9px]"
                        >
                          Google ile Hemen Giriş Yap →
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <button 
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  className="w-full bg-white text-[#05070A] hover:bg-slate-100 disabled:opacity-50 py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 shadow-xl shadow-white/5"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Google Hesabı ile Devam Et
                </button>

                <div className="relative py-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/5"></div>
                  </div>
                  <div className="relative flex justify-center text-[10px] font-black uppercase tracking-widest">
                    <span className="bg-[#0D1117] px-4 text-slate-600 font-bold">Veya E-posta Kullan</span>
                  </div>
                </div>

                {authMode === 'register' && (
                  <div className="space-y-4">
                    <div className="relative">
                      <UserCircle className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input 
                        type="text" 
                        placeholder="Kullanıcı Adı"
                        required
                        className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-4 py-3.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all placeholder:text-slate-600"
                        value={authFormData.username}
                        onChange={(e) => setAuthFormData({...authFormData, username: e.target.value})}
                      />
                    </div>
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                      <input 
                        type="tel" 
                        placeholder="Telefon Numarası"
                        className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-4 py-3.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all placeholder:text-slate-600"
                        value={authFormData.phone}
                        onChange={(e) => setAuthFormData({...authFormData, phone: e.target.value})}
                      />
                    </div>
                  </div>
                )}

                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input 
                    type="email" 
                    placeholder="E-posta Adresi"
                    required
                    className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-4 py-3.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all placeholder:text-slate-600"
                    value={authFormData.email}
                    onChange={(e) => setAuthFormData({...authFormData, email: e.target.value})}
                  />
                </div>

                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input 
                    type="password" 
                    placeholder="Şifre"
                    required
                    className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-4 py-3.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all placeholder:text-slate-600"
                    value={authFormData.password}
                    onChange={(e) => setAuthFormData({...authFormData, password: e.target.value})}
                  />
                </div>

                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/30 text-blue-400 py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserCircle className="w-5 h-5" />}
                  {authMode === 'login' ? 'Giriş Yap' : 'Hesap Oluştur'}
                </button>

                <div className="text-center pt-2">
                  <button 
                    type="button"
                    onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
                    className="text-[10px] font-black text-slate-500 uppercase tracking-widest hover:text-blue-400 transition-colors"
                  >
                    {authMode === 'login' ? 'E-posta ile kayıt mı olacaksın?' : 'Zaten hesabın var mı? Giriş Yap'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-3 pointer-events-none">
        <AnimatePresence>
          {activeToasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 100, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 50, scale: 0.9 }}
              className="bg-[#0D1117] backdrop-blur-xl p-5 rounded-2xl shadow-2xl w-80 pointer-events-auto relative overflow-hidden group border"
              style={{ borderColor: THEMES[currentTheme].border }}
            >
              <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: THEMES[currentTheme].color }} />
              <div className="flex items-start gap-4">
                <div className="p-2 rounded-xl" style={{ backgroundColor: THEMES[currentTheme].bg }}>
                  <Bell className={`w-5 h-5 ${THEMES[currentTheme].text}`} style={{ fill: THEMES[currentTheme].color + '33' }} />
                </div>
                <div className="flex-1">
                  <h3 className={`text-[10px] font-black uppercase tracking-widest mb-1 ${THEMES[currentTheme].text}`}>{toast.title}</h3>
                  <p className="text-sm font-bold text-white leading-tight">{toast.message}</p>
                </div>
                <button 
                  onClick={() => setActiveToasts(prev => prev.filter(t => t.id !== toast.id))}
                  className="text-slate-600 hover:text-white transition-colors"
                >
                  <Plus className="w-5 h-5 rotate-45" />
                </button>
              </div>
              <motion.div 
                initial={{ width: "100%" }}
                animate={{ width: "0%" }}
                transition={{ duration: 10, ease: "linear" }}
                className="absolute bottom-0 left-0 h-1 bg-blue-500/20"
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
        input[type="range"]::-webkit-slider-thumb {
          border: 2px solid white;
          box-shadow: 0 0 10px rgba(59, 130, 246, 0.5);
        }
      `}</style>
    </div>
  );
}
