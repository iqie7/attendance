import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { getDatabase, ref, onValue, set, remove, push } from 'firebase/database';
import 'bootstrap/dist/css/bootstrap.min.css';
import { QrReader } from '@blackbox-vision/react-qr-reader'; 
import QRCode from 'react-qr-code'; 

// ==========================================
//  GLOBAL CONFIGURATION
// ==========================================
const GRACE_PERIOD_MINUTES = 2; // Grace period (Early/Late buffer)

/* ---------------- FIREBASE CONFIG ---------------- */
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  databaseURL: 'https://attendance-ae1ee-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'attendance-ae1ee',
  storageBucket: 'attendance-ae1ee.appspot.com',
  messagingSenderId: '954081641400',
  appId: '1:954081641400:web:0d43d2b5b84a2e0304454d'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// ==========================================
//  HELPER: SMART LOGIC FOR ASSIGNING SCANS
// ==========================================
const processDailyScans = (schedules, rawLogs) => {
  const processedData = schedules.map(() => ({ logs: [] }));

  if (!rawLogs) return processedData.map(() => ({ checkin: '--:--', checkout: '--:--', status: 'missing' }));

  const sortedScans = Object.values(rawLogs).map(l => l.time).sort();

  sortedScans.forEach(scanTime => {
    const [h, m] = scanTime.split(':').map(Number);
    const scanMins = h * 60 + m;

    let bestMatchIndex = -1;
    let bestDistance = Infinity;
    let isStrictMatch = false;

    schedules.forEach((sch, index) => {
      const [startStr, endStr] = sch.time.split(' - ');
      const [sh, sm] = startStr.split(':').map(Number);
      const [eh, em] = endStr.split(':').map(Number);
      const startMins = sh * 60 + sm;
      const endMins = eh * 60 + em;

      const bufferStart = startMins - GRACE_PERIOD_MINUTES; 
      const bufferEnd = endMins + GRACE_PERIOD_MINUTES;      

      if (scanMins >= bufferStart && scanMins <= bufferEnd) {
        const strictlyInside = (scanMins >= startMins && scanMins <= endMins);
        const dist = Math.abs(scanMins - startMins);

        if (strictlyInside) {
          if (!isStrictMatch || dist < bestDistance) {
            bestMatchIndex = index;
            bestDistance = dist;
            isStrictMatch = true;
          }
        } else if (!isStrictMatch) {
          if (dist < bestDistance) {
            bestMatchIndex = index;
            bestDistance = dist;
          }
        }
      }
    });

    if (bestMatchIndex !== -1) {
      processedData[bestMatchIndex].logs.push(scanTime);
    }
  });

  return processedData.map((data, index) => {
    const sch = schedules[index];
    const [startStr] = sch.time.split(' - ');
    const [sh, sm] = startStr.split(':').map(Number);
    const startMins = sh * 60 + sm;

    if (data.logs.length === 0) return { checkin: '--:--', checkout: '--:--', status: 'missing' };
    
    const uniqueLogs = [...new Set(data.logs)];
    const checkin = uniqueLogs[0];
    const checkout = uniqueLogs.length > 1 ? uniqueLogs[uniqueLogs.length - 1] : '--:--';

    const [ch, cm] = checkin.split(':').map(Number);
    const checkinMins = ch * 60 + cm;
    const lateThreshold = startMins + GRACE_PERIOD_MINUTES; 

    let status = 'present';
    if (checkinMins > lateThreshold) status = 'late';

    return { checkin, checkout, status };
  });
};


// ==========================================
//  COMPONENT 1: DEDICATED QR SCANNER (KIOSK)
// ==========================================
function QRScannerPage() {
  const [scanResult, setScanResult] = useState(null); 
  const [scannedName, setScannedName] = useState('');
  const [debugScannedCode, setDebugScannedCode] = useState('');
  const [teachers, setTeachers] = useState(null);
  
  const [cameraKey, setCameraKey] = useState(0); 
  const [facingMode, setFacingMode] = useState('environment'); 
  const lockScan = useRef(false);
  const fileInputRef = useRef(null); 

  useEffect(() => {
    onValue(ref(db, 'teachers'), s => {
      const data = s.val() || {};
      setTeachers(data);
      console.log("System Loaded. IDs:", Object.keys(data));
    });
  }, []);

  const handleScan = (rawUid) => {
    if (lockScan.current || !teachers || !rawUid) return;

    const uid = rawUid.trim(); 

    if (teachers[uid]) {
      lockScan.current = true;
      const now = new Date();

      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`; 
      const timeStr = now.toTimeString().split(' ')[0];

      const logRef = push(ref(db, `attendance_logs/${dateStr}/${uid}`));
      set(logRef, { time: timeStr, method: 'QR_KIOSK' })
        .then(() => {
          setScannedName(teachers[uid].name);
          setScanResult('success');
          
          setTimeout(() => {
            setScanResult(null);
            setScannedName('');
            lockScan.current = false;
          }, 3000);
        });

    } else {
      lockScan.current = true;
      setScanResult('error');
      setDebugScannedCode(uid); 
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!('BarcodeDetector' in window)) {
      alert("Your browser does not support image scanning. Please use Chrome on Android or Safari on iOS.");
      return;
    }

    try {
      const barcodeDetector = new window.BarcodeDetector({ formats: ['qr_code'] });
      const imageBitmap = await createImageBitmap(file);
      const barcodes = await barcodeDetector.detect(imageBitmap);
      
      if (barcodes.length > 0) {
        handleScan(barcodes[0].rawValue);
      } else {
        alert("No QR Code found in this image.");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to read image.");
    }
    
    e.target.value = null;
  };

  const handleRetry = () => {
    setScanResult(null);
    setDebugScannedCode('');
    lockScan.current = false;
    setCameraKey(prev => prev + 1); 
  };

  const toggleCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
    setCameraKey(prev => prev + 1);
  };

  if (!teachers) {
    return (
      <div className="vh-100 bg-dark d-flex flex-column align-items-center justify-content-center text-white">
        <div className="spinner-border text-primary mb-3"></div>
        <h3>Loading Database...</h3>
      </div>
    );
  }

  return (
    <div className="vh-100 bg-dark d-flex flex-column align-items-center justify-content-center text-white position-relative overflow-hidden">
      
      <div className="position-absolute top-0 w-100 p-3 d-flex justify-content-between align-items-center bg-black bg-opacity-50" style={{zIndex: 10}}>
        <h4 className="m-0 fw-bold d-none d-sm-block">📷 Kiosk</h4>
        <div className="d-flex gap-2">
            <input 
              type="file" 
              ref={fileInputRef} 
              style={{display:'none'}} 
              accept="image/*" 
              onChange={handleFileUpload} 
            />
            <button className="btn btn-warning btn-sm fw-bold shadow-sm" onClick={() => fileInputRef.current.click()}>
                📁 Upload QR
            </button>
            <button className="btn btn-outline-light btn-sm" onClick={toggleCamera}>
                🔄 Flip Cam
            </button>
        </div>
      </div>

      {scanResult === 'success' && (
        <div className="position-absolute w-100 h-100 d-flex flex-column justify-content-center align-items-center bg-success" style={{zIndex: 20}}>
          <h1 className="fw-bold display-1">✅</h1>
          <h1 className="fw-bold display-4">Welcome!</h1>
          <h2 className="mt-2">{scannedName}</h2>
        </div>
      )}

      {scanResult === 'error' && (
        <div className="position-absolute w-100 h-100 d-flex flex-column justify-content-center align-items-center bg-danger p-4" style={{zIndex: 20}}>
          <h1 className="fw-bold display-1 mb-2">⚠️</h1>
          <h2 className="fw-bold">Invalid QR Code</h2>
          <div className="bg-black p-3 rounded mt-3 text-center w-100 shadow" style={{maxWidth: '500px', border: '2px solid yellow'}}>
            <h5 className="text-warning mb-0">READING:</h5>
            <h3 className="font-monospace text-white">{debugScannedCode}</h3>
          </div>
          <button onClick={handleRetry} className="btn btn-light fw-bold px-5 py-3 mt-4 rounded-pill shadow-lg">🔄 Try Again</button>
        </div>
      )}

      <div className="position-relative shadow-lg" style={{ width: '100%', maxWidth: '500px', aspectRatio: '1/1', borderRadius: '30px', overflow: 'hidden', border: '8px solid #333' }}>
        <QrReader
          key={cameraKey}
          onResult={(res) => { if (res) handleScan(res.text); }}
          constraints={{ facingMode: facingMode, aspectRatio: 1 }}
          videoStyle={{ objectFit: 'cover' }} 
          style={{ width: '100%', height: '100%' }}
        />
        {!scanResult && (
            <div className="position-absolute w-100 bg-danger opacity-50" style={{height: '2px', top: '50%', boxShadow: '0 0 10px red'}}></div>
        )}
      </div>

      <div className="mt-4 text-center opacity-50">
        <p>Current: {facingMode === 'user' ? 'Front Camera' : 'Back Camera'}</p>
        <small>{Object.keys(teachers).length} Teachers Loaded</small>
      </div>
    </div>
  );
}


// ==========================================
//  COMPONENT 2: ADMIN DASHBOARD (Main App)
// ==========================================
function AdminDashboard() {
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [activeTab, setActiveTab] = useState('monitor');
  const [teachers, setTeachers] = useState({});
  const [attendance, setAttendance] = useState({});
  const [allData, setAllData] = useState({});
  const [regUid, setRegUid] = useState('');
  const [regName, setRegName] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [terminalLog, setTerminalLog] = useState('System Initialized...');
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  
  // MODALS
  const [viewingStaff, setViewingStaff] = useState(null);
  const [showQRGen, setShowQRGen] = useState(null); 

  // TIMETABLE
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [selectedDay, setSelectedDay] = useState('Monday');
  const [assignSubject, setAssignSubject] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [editingKey, setEditingKey] = useState(null);

  // ANALYTICS & DATE
  const [analyticsMode, setAnalyticsMode] = useState('monthly'); 
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().substring(0, 7));
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const dateInputRef = useRef(null);

  const currentDayName = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date(selectedDate));

  const formatMalaysianDate = (dateString) => {
    if (!dateString) return "--/--/----";
    const [year, month, day] = dateString.split('-');
    return `${day}/${month}/${year}`;
  };

  const getWeekOfMonth = (dateString) => {
    const day = new Date(dateString).getDate();
    return Math.ceil(day / 7);
  };

  const calculateDailyHoursFromLogs = (dayLogs) => {
    if(!dayLogs) return { first: '--:--', last: '--:--', hours: 0 };
    const times = Object.values(dayLogs).map(l => l.time).sort();
    if(times.length < 1) return { first: '--:--', last: '--:--', hours: 0 };
    const first = times[0];
    const last = times.length > 1 ? times[times.length-1] : '--:--';
    
    // Simple diff
    const [h1, m1] = first.split(':').map(Number);
    const [h2, m2] = last.split(':').map(Number);
    const date1 = new Date(0, 0, 0, h1, m1, 0);
    const date2 = new Date(0, 0, 0, h2, m2, 0);
    const diff = (date2 - date1) / (1000 * 60 * 60);
    
    return { first, last, hours: diff > 0 ? diff : 0 };
  };

  useEffect(() => { onAuthStateChanged(auth, setUser); }, []);

  useEffect(() => {
    if (!user) return;
    onValue(ref(db, 'teachers'), s => setTeachers(s.val() || {}));
    onValue(ref(db, 'terminal_log'), s => setTerminalLog(s.val() || '---'));
    onValue(ref(db, 'latest_scan'), s => { if (s.exists()) { setRegUid(s.val()); setIsScanning(false); } });
    onValue(ref(db, 'config/scan_mode'), s => { setIsScanning(s.val() || false); });
    onValue(ref(db, `attendance_logs/${selectedDate}`), s => setAttendance(s.val() || {}));
    onValue(ref(db, 'attendance_logs'), s => setAllData(s.val() || {}));
  }, [user, selectedDate]);

  const handleLogin = e => { e.preventDefault(); signInWithEmailAndPassword(auth, email, password).catch(() => alert('Access Denied')); };
  const clearEnrollment = () => { remove(ref(db, 'latest_scan')); set(ref(db, 'config/scan_mode'), false); setRegUid(''); setRegName(''); setIsScanning(false); };
  
  const handleRegisterStaff = (e) => {
    e.preventDefault();
    if (!regUid || !regName) return;
    set(ref(db, `teachers/${regUid}`), { name: regName }).then(() => { clearEnrollment(); setActiveTab('timetable'); });
  };

  const handleUpdateTimetable = (e) => {
    e.preventDefault();
    if (!selectedTeacherId || !startTime || !endTime || !assignSubject) return;
    if (endTime <= startTime) { alert("Invalid Time Range"); return; }
    const path = `teachers/${selectedTeacherId}/timetable/${selectedDay}/${editingKey || push(ref(db)).key}`;
    set(ref(db, path), { subject: assignSubject, time: `${startTime} - ${endTime}` }).then(() => {
      alert("Timetable Saved"); setAssignSubject(''); setStartTime(''); setEndTime(''); setEditingKey(null);
    });
  };

  const handleDeleteSchedule = (uid, day, key) => { if (window.confirm("Delete?")) remove(ref(db, `teachers/${uid}/timetable/${day}/${key}`)); };
  
  const handleEditSchedule = (uid, day, key, s) => {
    setEditingKey(key); setSelectedTeacherId(uid); setSelectedDay(day); setAssignSubject(s.subject);
    const times = s.time.split(' - '); setStartTime(times[0]); setEndTime(times[1]); window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetDay = () => { 
    if (window.confirm(`Reset attendance for ${formatMalaysianDate(selectedDate)}?`)) {
      set(ref(db, `attendance_logs/${selectedDate}`), {}); set(ref(db, `attendance/${selectedDate}`), {}); 
    }
  };

  if (!user) {
    return (
      <div className="vh-100 d-flex justify-content-center align-items-center" style={{ background: '#0f172a' }}>
        <div className="card p-5 shadow-lg border-0 w-100 mx-3 text-center" style={{ maxWidth: 420, borderRadius: '24px' }}>
          <h3 className="fw-bold text-dark mb-4">EduTrack Pro</h3>
          <form onSubmit={handleLogin}>
            <input type="text" className="form-control bg-light border-0 mb-3 py-2" placeholder="Admin ID" onChange={e => setEmail(e.target.value)} required />
            <input type="password" className="form-control bg-light border-0 mb-4 py-2" placeholder="Security Key" onChange={e => setPassword(e.target.value)} required />
            <button className="btn btn-primary w-100 py-3 fw-bold border-0 shadow" style={{borderRadius:'12px', background:'#4f46e5'}}>Login</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-vh-100 bg-light d-flex flex-column" style={{ overflowX: 'hidden' }}>
      <style>{`
        @media (min-width: 768px) { .main-wrapper { position: relative; min-height: 100vh; display: flex; flex-direction: column; } .monitor-box { position: absolute; bottom: 20px; left: 20px; right: 20px; } .content-area { flex-grow: 1; padding-bottom: 180px; } .adaptive-table td, .adaptive-table th { padding: 1.2rem 1rem; font-size: 1rem; } }
        @media (max-width: 767px) { .feed-table td, .feed-table th { padding: 0.5rem 0.2rem !important; font-size: 0.7rem !important; } .name-col-feed { max-width: 75px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: bold; } .status-pill-feed { font-size: 0.6rem !important; padding: 2px 6px !important; } .monitor-box { position: static !important; margin-top: 20px; } }
        .nav-link-custom { border: none; padding: 14px 24px; border-radius: 12px; color: #94a3b8; width: 100%; text-align: left; margin-bottom: 8px; transition: 0.3s; background: transparent; font-weight: 500; }
        .nav-link-custom:hover { background: rgba(255,255,255,0.05); color: white; }
        .active-nav { background: #4f46e5 !important; color: white !important; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3); }
        .metric-card { border-radius: 20px; border: none; background: white; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
        .status-pill { font-size: 0.75rem; padding: 5px 12px; border-radius: 100px; font-weight: 600; text-transform: uppercase; }
        .custom-date-box { cursor: pointer; background: #fff; border: 1px solid #dee2e6; padding: 5px 15px; border-radius: 10px; }
      `}</style>

      {/* --- DASHBOARD UI --- */}
      <nav className="navbar navbar-dark bg-dark d-md-none px-4 sticky-top shadow-sm" style={{ background: '#1e293b', zIndex: 1050 }}>
        <span className="navbar-brand fw-bold">EduTrack Pro</span>
        <button className="btn btn-outline-light btn-sm rounded-3" onClick={() => setShowMobileMenu(!showMobileMenu)}>{showMobileMenu ? '✕ Close' : '☰ Menu'}</button>
      </nav>

      {showMobileMenu && (
        <div className="bg-dark text-white d-md-none p-4 shadow-lg position-fixed w-100" style={{ background: '#1e293b', zIndex: 1040, top: '56px', height: '100vh' }}>
          <button className={`nav-link-custom mb-2 ${activeTab === 'monitor' ? 'active-nav' : ''}`} onClick={() => { setActiveTab('monitor'); setShowMobileMenu(false); }}>📊 Dashboard</button>
          <button className={`nav-link-custom mb-2 ${activeTab === 'teachers' ? 'active-nav' : ''}`} onClick={() => { setActiveTab('teachers'); setShowMobileMenu(false); }}>👨‍🏫 Teachers</button>
          <button className={`nav-link-custom mb-2 ${activeTab === 'register' ? 'active-nav' : ''}`} onClick={() => { setActiveTab('register'); setShowMobileMenu(false); }}>👤 Enrollment</button>
          <button className={`nav-link-custom ${activeTab === 'timetable' ? 'active-nav' : ''}`} onClick={() => { setActiveTab('timetable'); setShowMobileMenu(false); }}>📅 Timetable</button>
          <hr className="bg-secondary" />
          <button className="btn btn-outline-danger w-100 border-0 text-start" onClick={() => signOut(auth)}>Sign Out</button>
        </div>
      )}

      <div className="d-flex flex-grow-1">
        <div className="p-4 d-none d-md-flex flex-column sticky-top shadow" style={{ width: 280, height: '100vh', background: '#1e293b' }}>
          <div className="mb-5 px-3"><h4 className="fw-bold text-white mb-0">EduTrack Pro</h4></div>
          <button className={`nav-link-custom mb-3 ${activeTab === 'monitor' ? 'active-nav' : ''}`} onClick={() => setActiveTab('monitor')}>📊 Dashboard</button>
          <button className={`nav-link-custom mb-3 ${activeTab === 'teachers' ? 'active-nav' : ''}`} onClick={() => setActiveTab('teachers')}>👨‍🏫 Teachers</button>
          <button className={`nav-link-custom mb-3 ${activeTab === 'register' ? 'active-nav' : ''}`} onClick={() => setActiveTab('register')}>👤 Enrollment</button>
          <button className={`nav-link-custom mb-3 ${activeTab === 'timetable' ? 'active-nav' : ''}`} onClick={() => setActiveTab('timetable')}>📅 Timetable</button>
          <div className="mt-auto pt-4 border-top border-secondary text-start">
            
            {/* UPDATED KIOSK BUTTON - NOW USES HASH ROUTING */}
            <button className="btn btn-link text-info text-decoration-none w-100 text-start p-0 small mb-2" onClick={() => window.open('/#/qr', '_blank')}>📷 Open Kiosk Mode</button>
            
            <button className="btn btn-link text-warning text-decoration-none w-100 text-start p-0 small mb-2" onClick={resetDay}>Reset Date</button>
            <button className="btn btn-link text-danger text-decoration-none w-100 text-start p-0 small" onClick={() => signOut(auth)}>Sign Out</button>
          </div>
        </div>

        <div className="flex-grow-1 p-3 p-md-5 main-wrapper bg-light overflow-auto" style={{ height: '100vh' }}>
          <div className="content-area">
            <div className="d-flex justify-content-between align-items-center mb-4">
               <h4 className="fw-bold m-0 text-capitalize">{activeTab === 'monitor' ? 'Attendance Feed' : activeTab + ' Centre'}</h4>
               {activeTab === 'monitor' && (
                <div className="custom-date-box shadow-sm d-flex align-items-center" onClick={() => dateInputRef.current.showPicker()}>
                  <div className="me-3 text-end">
                    <div className="text-muted fw-bold" style={{fontSize: '0.6rem'}}>VIEW DATE</div>
                    <div className="fw-bold text-dark">{formatMalaysianDate(selectedDate)}</div>
                  </div>
                  <span className="text-primary fs-5">📅</span>
                  <input ref={dateInputRef} type="date" className="position-absolute opacity-0" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
                </div>
               )}
            </div>
            
            {activeTab === 'monitor' && (
              <div className="card metric-card overflow-hidden">
                <div className="p-3 bg-white border-bottom fw-bold text-primary small uppercase">TODAY: {currentDayName} ({formatMalaysianDate(selectedDate)})</div>
                <div className="table-responsive">
                  <table className="table adaptive-table feed-table align-middle mb-0 text-center">
                    <thead className="table-light small fw-bold text-muted text-uppercase">
                      <tr><th className="ps-3">Name</th><th>Subject</th><th>Assigned Time</th><th>In</th><th>Out</th><th className="text-center">Status</th></tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const list = [];
                        Object.keys(teachers).forEach(uid => {
                          const daySch = teachers[uid].timetable?.[currentDayName] || {};
                          Object.keys(daySch).forEach(key => {
                            const timeVal = daySch[key].time || "";
                            list.push({ uid, name: teachers[uid].name, subject: daySch[key].subject, time: timeVal, start: timeVal.split(' - ')[0] });
                          });
                        });
                        
                        // Sort by start time
                        list.sort((a, b) => a.start.localeCompare(b.start));

                        if(list.length === 0) return <tr><td colSpan="6" className="py-5 text-muted small">No schedules found.</td></tr>;

                        // ------------------------------------------------
                        // PRE-CALCULATE ALL ATTENDANCE FOR THE LIST HERE
                        // ------------------------------------------------
                        
                        // 1. Gather all logs relevant to the visible teachers
                        const relevantLogs = {}; 
                        list.forEach(item => {
                            if(attendance[item.uid]) {
                                relevantLogs[item.uid] = attendance[item.uid];
                            }
                        });

                        // 2. Map the data using smart processor
                        const finalRows = list.map((item) => {
                            // Find all schedules for THIS teacher for THIS day
                            const teacherSchedules = [];
                            const daySch = teachers[item.uid].timetable?.[currentDayName] || {};
                            Object.keys(daySch).forEach(k => {
                                teacherSchedules.push({ ...daySch[k], id: k });
                            });
                            // Sort them
                            teacherSchedules.sort((a,b) => a.time.localeCompare(b.time));

                            // Process logs for this teacher
                            const processedStats = processDailyScans(teacherSchedules, attendance[item.uid]);

                            // Find the specific result for *this* row (matching subject & time)
                            const myStatIndex = teacherSchedules.findIndex(s => s.subject === item.subject && s.time === item.time);
                            const result = processedStats[myStatIndex] || { checkin: '--:--', checkout: '--:--', status: 'missing' };

                            return (
                                <tr key={`${item.uid}-${item.time}`}>
                                  <td className="ps-3 name-col-feed fw-bold">{item.name}</td>
                                  <td className="text-primary small fw-bold">{item.subject}</td>
                                  <td className="text-muted small">{item.time.replace(/ /g,'')}</td>
                                  <td className="fw-bold text-dark">{result.checkin}</td>
                                  <td className="fw-bold text-secondary">{result.checkout}</td>
                                  <td className="text-center">
                                    <span className={`status-pill status-pill-feed ${
                                        result.status === 'present' ? 'bg-success text-white' : 
                                        result.status === 'late' ? 'bg-warning text-dark' : 
                                        'bg-danger text-white'
                                    }`}>
                                      {result.status.toUpperCase()}
                                    </span>
                                  </td>
                                </tr>
                            );
                        });

                        return finalRows;
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'teachers' && (
              <div className="card metric-card p-4 shadow-lg">
                <div className="d-flex justify-content-between align-items-center mb-4 border-bottom pb-2 text-start">
                    <h5 className="fw-bold text-primary mb-0">Teacher Analytics</h5>
                    <div className="d-flex gap-2">
                        <select className="form-select form-select-sm w-auto" value={analyticsMode} onChange={e => setAnalyticsMode(e.target.value)}>
                            <option value="monthly">Monthly</option>
                            <option value="weekly">Weekly</option>
                        </select>
                        <select className="form-select form-select-sm w-auto" value={selectedWeek} onChange={e => setSelectedWeek(Number(e.target.value))}>
                            <option value="1">Week 1</option><option value="2">Week 2</option><option value="3">Week 3</option><option value="4">Week 4</option>
                        </select>
                        <input type="month" className="form-control form-control-sm w-auto" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} />
                    </div>
                </div>
                <table className="table align-middle text-start">
                    <thead className="table-light"><tr><th>Teacher Name (Click 📷 for Code)</th><th className="text-center">Total Hours</th></tr></thead>
                    <tbody>
                      {Object.keys(teachers).map(uid => {
                        let hrs = 0;
                        Object.keys(allData).forEach(date => {
                          if (date.startsWith(selectedMonth)) {
                            const isMatch = (analyticsMode === 'weekly') ? (getWeekOfMonth(date) === selectedWeek && allData[date][uid]) : (allData[date][uid]);
                            if (isMatch) hrs += calculateDailyHoursFromLogs(allData[date][uid]).hours;
                          }
                        });
                        return (
                          <tr key={uid}>
                            <td>
                                <div className="d-flex align-items-center">
                                    <button className="btn btn-light btn-sm me-2 shadow-sm" onClick={() => setShowQRGen(uid)}>📷</button>
                                    <button className="btn btn-link p-0 fw-bold text-decoration-none text-dark" onClick={() => setViewingStaff(uid)}>{teachers[uid].name}</button>
                                </div>
                            </td>
                            <td className="text-center fw-bold text-primary">{hrs.toFixed(2)} Hrs</td>
                          </tr>
                        );
                      })}
                    </tbody>
                </table>
              </div>
            )}

            {/* ENROLLMENT & TIMETABLE COMPONENTS REMAIN THE SAME */}
            {activeTab === 'register' && (
              <div className="card metric-card p-5 mx-auto text-center shadow-lg" style={{ maxWidth: 500 }}>
                {!regUid ? (
                  <div className="py-4">
                    <div className={`mb-4 mx-auto bg-light rounded-circle p-4 d-flex justify-content-center align-items-center`} style={{width:'100px', height:'100px'}}>
                      <span className="fs-1">{isScanning ? '📡' : '👤'}</span>
                    </div>
                    <h4 className="fw-bold mb-3">{isScanning ? 'Searching...' : 'New Enrollment'}</h4>
                    <button className="btn btn-primary px-5 py-2 fw-bold shadow-sm w-100" style={{borderRadius:'12px'}} onClick={() => set(ref(db, 'config/scan_mode'), true)} disabled={isScanning}>Start Scan</button>
                    {isScanning && <button className="btn btn-link text-danger d-block mx-auto mt-3 fw-bold text-decoration-none" onClick={clearEnrollment}>Cancel Scan</button>}
                  </div>
                ) : (
                  <form onSubmit={handleRegisterStaff}>
                    <div className="alert alert-primary fw-bold text-start small border-0">RFID DETECTED: {regUid}</div>
                    <label className="small fw-bold text-secondary mb-2 text-start d-block">STAFF FULL NAME</label>
                    <input className="form-control mb-4 py-3" placeholder="Full Name" required value={regName} onChange={e => setRegName(e.target.value)} autoFocus />
                    <button className="btn btn-success btn-lg w-100 fw-bold shadow-sm" style={{borderRadius:'12px'}}>Save Teacher</button>
                    <button type="button" className="btn btn-link text-muted mt-3 text-decoration-none small" onClick={clearEnrollment}>Discard Scan</button>
                  </form>
                )}
              </div>
            )}

            {activeTab === 'timetable' && (
              <div className="card metric-card p-4 mx-auto shadow-lg" style={{ maxWidth: 800 }}>
                <h5 className="fw-bold mb-4 border-bottom pb-2 text-primary text-start">{editingKey ? 'Edit Schedule' : 'Assign Timetable'}</h5>
                <form onSubmit={handleUpdateTimetable} className="text-start">
                  <div className="row g-3">
                    <div className="col-md-6 text-start"><label className="small fw-bold">CHOOSE TEACHER</label>
                        <select className="form-select border-0 bg-light py-2" value={selectedTeacherId} onChange={e => setSelectedTeacherId(e.target.value)} required>
                          <option value="">-- Choose staff --</option>
                          {Object.keys(teachers).map(uid => <option key={uid} value={uid}>{teachers[uid].name}</option>)}
                        </select>
                    </div>
                    <div className="col-md-6 text-start"><label className="small fw-bold">SELECT DAY</label>
                        <select className="form-select border-0 bg-light py-2" value={selectedDay} onChange={e => setSelectedDay(e.target.value)} required>
                          <option value="Monday">Monday</option><option value="Tuesday">Tuesday</option><option value="Wednesday">Wednesday</option>
                          <option value="Thursday">Thursday</option><option value="Friday">Friday</option><option value="Saturday">Saturday</option><option value="Sunday">Sunday</option>
                        </select>
                    </div>
                    <div className="col-12 text-start"><label className="small fw-bold">ASSIGN SUBJECT</label>
                        <select className="form-select border-0 bg-light py-2" value={assignSubject} onChange={e => setAssignSubject(e.target.value)} required>
                          <option value="">-- Select Subject --</option>
                          <option value="Bahasa Melayu">Bahasa Melayu</option>
                          <option value="Matematik">Matematik</option>
                          <option value="Sains">Sains</option>
                          <option value="Bahasa Inggeris">Bahasa Inggeris</option>
                          <option value="Sejarah">Sejarah</option>
                        </select>
                    </div>
                    <div className="col-6 text-start"><label className="small fw-bold">START TIME</label><input type="time" className="form-control border-0 bg-light" value={startTime} onChange={e => setStartTime(e.target.value)} required /></div>
                    <div className="col-6 text-start"><label className="small fw-bold">END TIME</label><input type="time" className="form-control border-0 bg-light" value={endTime} onChange={e => setEndTime(e.target.value)} required /></div>
                  </div>
                  <button className="btn btn-primary w-100 py-2 fw-bold shadow mt-4">Save Timetable</button>
                  {editingKey && <button className="btn btn-link text-muted w-100 mt-2" onClick={() => { setEditingKey(null); setAssignSubject(''); setStartTime(''); setEndTime(''); }}>Cancel Edit</button>}
                </form>

                <div className="mt-5 text-start">
                  <h6 className="fw-bold text-muted small text-uppercase border-bottom pb-2">Assigned Schedules</h6>
                  <div style={{maxHeight:'400px', overflowY:'auto'}}>
                  {Object.keys(teachers).map(uid => teachers[uid].timetable && (
                    <div key={uid} className="mb-4 ps-3 border-start border-primary border-4">
                      <div className="fw-bold mb-2 text-dark">{teachers[uid].name}</div>
                      {Object.keys(teachers[uid].timetable).map(day => Object.keys(teachers[uid].timetable[day]).map(key => {
                        const s = teachers[uid].timetable[day][key];
                        return (
                          <div key={key} className="d-flex justify-content-between align-items-center small py-2 border-bottom">
                            <span><strong>{day.substring(0,3)}</strong>: {s.subject} ({s.time})</span>
                            <div className="btn-group">
                                <button className="btn btn-sm text-primary p-0 me-2" onClick={() => handleEditSchedule(uid, day, key, s)}>Edit</button>
                                <button className="btn btn-sm text-danger p-0" onClick={() => handleDeleteSchedule(uid, day, key)}>Delete</button>
                            </div>
                          </div>
                        );
                      }))}
                    </div>
                  ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {activeTab !== 'timetable' && (
            <div className="monitor-box mt-4">
              <div className="card border-0 shadow-sm" style={{ borderRadius: '12px', overflow: 'hidden' }}>
                <div className="card-header bg-white border-0 py-2 fw-bold small text-start">SERIAL_MONITOR: {terminalLog}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* VIEW HISTORY MODAL */}
      {viewingStaff && (
        <div className="position-fixed top-0 start-0 w-100 h-100 d-flex justify-content-center align-items-center" style={{ zIndex: 2000, background: 'rgba(0,0,0,0.6)' }}>
            <div className="card shadow-lg p-4 w-100 mx-3" style={{ maxWidth: '600px', maxHeight: '85vh', overflowY: 'auto', borderRadius: '24px' }}>
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h5 className="fw-bold m-0 text-primary">Attendance Log: {teachers[viewingStaff].name}</h5>
                    <button className="btn-close" onClick={() => setViewingStaff(null)}></button>
                </div>
                <div className="table-responsive">
                    <table className="table table-sm small align-middle text-center">
                        <thead className="table-light text-uppercase"><tr><th>Date</th><th>In</th><th>Out</th><th>Hours</th></tr></thead>
                        <tbody>
                            {Object.keys(allData).sort((a, b) => b.localeCompare(a)).map(date => {
                                const dayLogs = allData[date][viewingStaff];
                                if (!dayLogs) return null;
                                const stats = calculateDailyHoursFromLogs(dayLogs);
                                return (
                                    <tr key={date}>
                                        <td className="fw-bold">{formatMalaysianDate(date)}</td>
                                        <td className="text-success">{stats.first}</td>
                                        <td className="text-danger">{stats.last}</td>
                                        <td className="fw-bold">{stats.hours.toFixed(2)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <button className="btn btn-secondary w-100 mt-3 fw-bold" style={{borderRadius: '12px'}} onClick={() => setViewingStaff(null)}>Close History</button>
            </div>
        </div>
      )}

      {/* QR GENERATOR MODAL */}
      {showQRGen && (
        <div className="position-fixed top-0 start-0 w-100 h-100 d-flex justify-content-center align-items-center" style={{ zIndex: 3000, background: 'rgba(0,0,0,0.85)' }}>
            <div className="card shadow-lg p-4 w-100 mx-3 text-center bg-white" style={{ maxWidth: '400px', borderRadius: '24px' }}>
                <h5 className="fw-bold mb-4">{teachers[showQRGen]?.name}</h5>
                <div className="p-3 bg-white mx-auto border rounded shadow-sm" style={{width:'fit-content'}}>
                    <QRCode value={showQRGen} size={200} />
                </div>
                <p className="text-muted small mt-3">Teacher ID: {showQRGen}</p>
                <button className="btn btn-primary w-100 mt-2 fw-bold" style={{borderRadius: '12px'}} onClick={() => setShowQRGen(null)}>Done</button>
            </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
//  MAIN APP COMPONENT (ROUTER)
// ==========================================
function App() {
  // ROUTING FIX: USE HASH ROUTING FOR GITHUB PAGES
  // This allows http://iqie7.github.io/repo-name/#/qr to work
  if (window.location.hash === '#/qr') {
    return <QRScannerPage />;
  }
  return <AdminDashboard />;
}

export default App;