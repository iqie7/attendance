import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { getDatabase, ref, onValue, set, remove } from 'firebase/database';
import 'bootstrap/dist/css/bootstrap.min.css';

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

function App() {
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [activeTab, setActiveTab] = useState('monitor');
  const [teachers, setTeachers] = useState({});
  const [attendance, setAttendance] = useState({});
  const [allData, setAllData] = useState({}); // Used for Monthly/Weekly Calculation
  const [regUid, setRegUid] = useState('');
  const [regName, setRegName] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [terminalLog, setTerminalLog] = useState('System Initialized...');
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  // Analytics Settings
  const [analyticsMode, setAnalyticsMode] = useState('monthly'); 
  const [selectedWeek, setSelectedWeek] = useState(1);

  // Date Logic
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().substring(0, 7));
  const dateInputRef = useRef(null);

  const formatMalaysianDate = (dateString) => {
    const [year, month, day] = dateString.split('-');
    return `${day}/${month}/${year}`;
  };

  const getWeekNumber = (d) => {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  };

  const getDiffInHours = (checkin, checkout) => {
    if (!checkin || !checkout) return 0;
    const [h1, m1, s1] = checkin.split(':').map(Number);
    const [h2, m2, s2] = checkout.split(':').map(Number);
    const date1 = new Date(0, 0, 0, h1, m1, s1);
    const date2 = new Date(0, 0, 0, h2, m2, s2);
    const diff = (date2 - date1) / (1000 * 60 * 60);
    return diff > 0 ? diff : 0;
  };

  useEffect(() => { onAuthStateChanged(auth, setUser); }, []);

  useEffect(() => {
    if (!user) return;
    onValue(ref(db, 'teachers'), s => setTeachers(s.val() || {}));
    onValue(ref(db, 'terminal_log'), s => setTerminalLog(s.val() || '---'));
    onValue(ref(db, 'latest_scan'), s => { 
      if (s.exists()) { setRegUid(s.val()); setIsScanning(false); } 
    });
    onValue(ref(db, 'config/scan_mode'), s => { setIsScanning(s.val() || false); });

    const attendanceRef = ref(db, `attendance/${selectedDate}`);
    const unsubscribe = onValue(attendanceRef, s => setAttendance(s.val() || {}));
    onValue(ref(db, 'attendance'), s => setAllData(s.val() || {}));

    return () => unsubscribe();
  }, [user, selectedDate]);

  const handleLogin = e => {
    e.preventDefault();
    signInWithEmailAndPassword(auth, email, password).catch(() => alert('Access Denied: Invalid Credentials'));
  };

  const clearEnrollment = () => {
    remove(ref(db, 'latest_scan'));
    set(ref(db, 'config/scan_mode'), false);
    setRegUid(''); setRegName(''); setIsScanning(false);
  };

  const resetDay = () => { 
    if (window.confirm(`Confirm: Reset all attendance data for ${formatMalaysianDate(selectedDate)}?`)) {
      set(ref(db, `attendance/${selectedDate}`), {}); 
    }
  };

  const totalTeachers = Object.keys(teachers).length;
  const presentToday = Object.values(attendance).filter(a => a.checkin).length;

  if (!user) {
    return (
      <div className="vh-100 d-flex justify-content-center align-items-center" style={{ background: '#0f172a' }}>
        <div className="card p-5 shadow-lg border-0 w-100 mx-3 text-center" style={{ maxWidth: 420, borderRadius: '24px', background: '#ffffff' }}>
          <div className="mb-4">
            <img src={`${process.env.PUBLIC_URL}/logo512.jpg`} alt="EduTrack Logo" className="mx-auto mb-3 rounded-3 shadow-sm" style={{ width: '80px', height: '80px', objectFit: 'cover' }} />
            <h3 className="fw-bold text-dark">EduTrack Pro</h3>
            <p className="text-muted small">Sign in to manage attendance</p>
          </div>
          <form onSubmit={handleLogin} autoComplete="off">
            <div className="text-start mb-3">
              <label className="small fw-bold text-secondary mb-1">ADMINISTRATOR ID</label>
              <input type="text" className="form-control bg-light border-0 py-2" placeholder="******" onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className="text-start mb-4">
              <label className="small fw-bold text-secondary mb-1">SECURITY KEY</label>
              <input type="password" className="form-control bg-light border-0 py-2" placeholder="******" autoComplete="new-password" onChange={e => setPassword(e.target.value)} required />
            </div>
            <button className="btn btn-primary w-100 py-3 fw-bold border-0 shadow" style={{ borderRadius: '12px', background: '#4f46e5' }}>Login to Dashboard</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-vh-100 bg-light d-flex flex-column" style={{ overflowX: 'hidden' }}>
      <style>{`
        @media (min-width: 768px) {
          .main-wrapper { position: relative; min-height: 100vh; display: flex; flex-direction: column; }
          .monitor-box { position: absolute; bottom: 20px; left: 20px; right: 20px; }
          .content-area { flex-grow: 1; padding-bottom: 180px; }
          .adaptive-table td, .adaptive-table th { padding: 1.2rem 1rem; font-size: 1rem; }
        }
        @media (max-width: 767px) {
          .main-wrapper { display: flex; flex-direction: column; }
          .monitor-box { margin-top: 20px; margin-bottom: 20px; }
          .adaptive-table td, .adaptive-table th { padding: 0.8rem 0.4rem !important; font-size: 0.75rem !important; }
          .name-col { max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: bold; }
        }
        .nav-link-custom { border: none; padding: 14px 24px; border-radius: 12px; color: #94a3b8; width: 100%; text-align: left; margin-bottom: 8px; transition: 0.3s; font-weight: 500; background: transparent; }
        .nav-link-custom:hover { background: rgba(255,255,255,0.05); color: white; }
        .active-nav { background: #4f46e5 !important; color: white !important; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3); }
        .metric-card { border-radius: 20px; border: none; background: white; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
        .status-pill { font-size: 0.75rem; padding: 5px 12px; border-radius: 100px; font-weight: 600; text-transform: uppercase; }
        .status-present { background: #dcfce7; color: #15803d; }
        .status-absent { background: #fee2e2; color: #b91c1c; }
        .custom-date-box { cursor: pointer; background: #fff; border: 1px solid #dee2e6; padding: 5px 15px; border-radius: 10px; transition: 0.2s; }
        .custom-date-box:hover { border-color: #4f46e5; }
        .scan-pulse { animation: pulse-blue 2s infinite; }
        @keyframes pulse-blue {
          0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(79, 70, 229, 0.7); }
          70% { transform: scale(1); box-shadow: 0 0 0 15px rgba(79, 70, 229, 0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(79, 70, 229, 0); }
        }
      `}</style>

      <nav className="navbar navbar-dark bg-dark d-md-none px-4 sticky-top shadow-sm" style={{ background: '#1e293b' }}>
        <span className="navbar-brand fw-bold">EduTrack Pro</span>
        <button className="btn btn-outline-light btn-sm rounded-3" onClick={() => setShowMobileMenu(!showMobileMenu)}>{showMobileMenu ? '✕ Close' : '☰ Menu'}</button>
      </nav>

      {showMobileMenu && (
        <div className="bg-dark text-white d-md-none p-4 shadow-lg position-relative" style={{ background: '#1e293b', borderTop: '1px solid #334155' }}>
          <button className={`nav-link-custom mb-2 ${activeTab === 'monitor' ? 'active-nav' : ''}`} onClick={() => { setActiveTab('monitor'); setShowMobileMenu(false); }}>📊 Dashboard</button>
          <button className={`nav-link-custom mb-2 ${activeTab === 'teachers' ? 'active-nav' : ''}`} onClick={() => { setActiveTab('teachers'); setShowMobileMenu(false); }}>👨‍🏫 Teachers</button>
          <button className={`nav-link-custom ${activeTab === 'register' ? 'active-nav' : ''}`} onClick={() => { setActiveTab('register'); setShowMobileMenu(false); }}>👤 Enrollment</button>
          <hr className="bg-secondary" />
          <button className="btn btn-outline-warning w-100 border-0 mb-2" onClick={resetDay}>Reset Data</button>
          <button className="btn btn-outline-danger w-100 border-0" onClick={() => signOut(auth)}>Sign Out</button>
        </div>
      )}

      <div className="d-flex flex-grow-1">
        <div className="p-4 d-none d-md-flex flex-column sticky-top shadow" style={{ width: 280, height: '100vh', background: '#1e293b' }}>
          <div className="mb-5 px-3"><h4 className="fw-bold text-white mb-0">EduTrack <span style={{ color: '#6366f1' }}>Pro</span></h4></div>
          <button className={`nav-link-custom mb-3 ${activeTab === 'monitor' ? 'active-nav' : ''}`} onClick={() => setActiveTab('monitor')}>📊 Dashboard</button>
          <button className={`nav-link-custom mb-3 ${activeTab === 'teachers' ? 'active-nav' : ''}`} onClick={() => setActiveTab('teachers')}>👨‍🏫 Teachers</button>
          <button className={`nav-link-custom mb-3 ${activeTab === 'register' ? 'active-nav' : ''}`} onClick={() => setActiveTab('register')}>👤 Enrollment</button>
          <div className="mt-auto pt-4 border-top border-secondary opacity-50 text-start">
            <button className="btn btn-link text-warning text-decoration-none w-100 text-start mb-2 p-0 small" onClick={resetDay}>Reset Date</button>
            <button className="btn btn-link text-danger text-decoration-none w-100 text-start p-0 small" onClick={() => signOut(auth)}>Sign Out</button>
          </div>
        </div>

        <div className="flex-grow-1 p-4 p-md-5 main-wrapper bg-light overflow-auto" style={{ height: '100vh' }}>
          <div className="content-area">
            <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-3">
               <h4 className="fw-bold m-0">{activeTab === 'monitor' ? 'Live Attendance Feed' : activeTab === 'teachers' ? 'Teacher Analytics' : 'Enrollment Center'}</h4>
               
               {activeTab === 'monitor' && (
                <div className="custom-date-box shadow-sm d-flex align-items-center" onClick={() => dateInputRef.current.showPicker()}>
                  <div className="me-3 text-end">
                    <div className="text-muted fw-bold" style={{fontSize: '0.6rem', letterSpacing: '1px'}}>VIEW DATE (MY)</div>
                    <div className="fw-bold text-dark">{formatMalaysianDate(selectedDate)}</div>
                  </div>
                  <span className="text-primary fs-5">📅</span>
                  <input ref={dateInputRef} type="date" className="position-absolute opacity-0" style={{pointerEvents: 'none'}} value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
                </div>
               )}

               {activeTab === 'teachers' && (
                 <div className="d-flex flex-wrap gap-2 align-items-center justify-content-start justify-content-md-end">
                   {analyticsMode === 'weekly' && (
                     <div className="bg-white p-2 shadow-sm rounded-3 d-flex align-items-center gap-2 border">
                       <span className="small fw-bold text-muted ps-2">WEEK:</span>
                       <select className="form-select form-select-sm border-0 bg-light fw-bold" style={{ width: 'auto', minWidth: '100px' }} value={selectedWeek} onChange={e => setSelectedWeek(parseInt(e.target.value))}>
                         <option value="1">Week 1</option>
                         <option value="2">Week 2</option>
                         <option value="3">Week 3</option>
                         <option value="4">Week 4</option>
                       </select>
                     </div>
                   )}
                   <div className="bg-white p-2 shadow-sm rounded-3 d-flex align-items-center gap-2 border">
                     <span className="small fw-bold text-muted ps-2">MONTH:</span>
                     <input type="month" className="form-control form-control-sm border-0 bg-light fw-bold" style={{ width: 'auto' }} value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} />
                   </div>
                 </div>
               )}
            </div>
            
            {activeTab === 'monitor' && (
              <>
                <div className="row g-4 mb-5 text-center">
                  <div className="col-6 col-md-3"><div className="metric-card p-4"><h2 className="fw-bold mb-0">{totalTeachers}</h2><span className="text-secondary small fw-bold">TOTAL STAFF</span></div></div>
                  <div className="col-6 col-md-3"><div className="metric-card p-4 border-start border-primary border-4"><h2 className="fw-bold text-primary mb-0">{presentToday}</h2><span className="text-secondary small fw-bold">PRESENT TODAY</span></div></div>
                </div>
                <div className="card metric-card overflow-hidden">
                  <div className="table-responsive">
                    <table className="table adaptive-table align-middle mb-0">
                      <thead className="table-light small fw-bold text-muted text-uppercase">
                        <tr><th className="ps-4">Staff Name</th><th className="d-none d-md-table-cell">UID</th><th>In</th><th>Out</th><th className="text-center">Status</th></tr>
                      </thead>
                      <tbody>
                        {Object.keys(teachers).map(uid => (
                          <tr key={uid}>
                            <td className="ps-4 name-col fw-bold">{teachers[uid].name}</td>
                            <td className="text-muted d-none d-md-table-cell small font-monospace">{uid}</td>
                            <td>{attendance[uid]?.checkin || '--:--'}</td>
                            <td>{attendance[uid]?.checkout || '--:--'}</td>
                            <td className="text-center"><span className={`status-pill ${attendance[uid]?.checkin ? 'status-present' : 'status-absent'}`}>{attendance[uid]?.checkin ? 'Present' : 'Missing'}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {activeTab === 'teachers' && (
              <div className="card metric-card overflow-hidden">
                <div className="p-3 bg-white border-bottom d-flex justify-content-between align-items-center flex-wrap gap-2">
                  <div className="small fw-bold text-muted text-uppercase">Total Hours - {analyticsMode === 'weekly' ? `Week ${selectedWeek}` : 'Monthly'} ({selectedMonth})</div>
                  <div className="btn-group btn-group-sm shadow-sm">
                    <button className={`btn ${analyticsMode === 'weekly' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setAnalyticsMode('weekly')}>Week</button>
                    <button className={`btn ${analyticsMode === 'monthly' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setAnalyticsMode('monthly')}>Month</button>
                  </div>
                </div>
                <div className="table-responsive">
                  <table className="table adaptive-table align-middle mb-0">
                    <thead className="table-light small fw-bold text-muted text-uppercase">
                      <tr><th className="ps-4 py-3">Teacher Name</th><th className="text-center">Total Hours</th></tr>
                    </thead>
                    <tbody>
                      {Object.keys(teachers).map(uid => {
                        let totalHrs = 0;
                        Object.keys(allData).forEach(date => {
                          const dayOfMonth = new Date(date).getDate();
                          let match = false;
                          if (analyticsMode === 'weekly') {
                            const weekNum = Math.ceil(dayOfMonth / 7);
                            if (weekNum === selectedWeek && date.startsWith(selectedMonth)) match = true;
                          } else if (analyticsMode === 'monthly' && date.startsWith(selectedMonth)) match = true;
                          if (match && allData[date][uid]) totalHrs += getDiffInHours(allData[date][uid].checkin, allData[date][uid].checkout);
                        });
                        return (<tr key={uid}><td className="ps-4 fw-bold text-dark">{teachers[uid].name}</td><td className="text-center fw-bold text-primary">{totalHrs.toFixed(2)} Hrs</td></tr>);
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'register' && (
              <div className="card metric-card p-5 mx-auto text-center shadow-lg" style={{ maxWidth: 500 }}>
                {!regUid ? (
                  <div className="py-4">
                    <div className={`mb-4 mx-auto d-flex align-items-center justify-content-center rounded-circle ${isScanning ? 'bg-primary text-white scan-pulse' : 'bg-light text-muted'}`} style={{ width: '100px', height: '100px' }}><span className="fs-1">{isScanning ? '📡' : '👤'}</span></div>
                    <h4 className="fw-bold mb-3">{isScanning ? 'Searching...' : 'New Enrollment'}</h4>
                    <div className="d-flex flex-column gap-2">
                      <button className="btn btn-primary px-5 py-2 fw-bold shadow-sm" style={{borderRadius: '12px'}} onClick={() => set(ref(db, 'config/scan_mode'), true)} disabled={isScanning}>Start Scan</button>
                      {isScanning && <button className="btn btn-link text-danger fw-bold mt-2 text-decoration-none" onClick={clearEnrollment}>Cancel RFID Scan</button>}
                    </div>
                  </div>
                ) : (
                  <form onSubmit={e => { e.preventDefault(); set(ref(db, `teachers/${regUid}`), { name: regName }).then(() => { clearEnrollment(); setActiveTab('monitor'); }); }}>
                    <div className="alert alert-primary fw-bold mb-4 text-truncate text-start small">ID: {regUid}</div>
                    <label className="small fw-bold text-secondary mb-2 text-start d-block">STAFF FULL NAME</label>
                    <input className="form-control form-control-lg border-0 bg-light mb-4 py-3" placeholder="Enter name" required value={regName} onChange={e => setRegName(e.target.value)} autoFocus />
                    <button className="btn btn-success btn-lg w-100 fw-bold shadow-sm" style={{borderRadius: '12px'}}>Confirm Save</button>
                    <button type="button" className="btn btn-link text-muted mt-3 text-decoration-none small" onClick={clearEnrollment}>Discard Scan / Cancel</button>
                  </form>
                )}
              </div>
            )}
          </div>

          <div className="monitor-box">
            <div className="card border-0 shadow-sm" style={{ borderRadius: '12px', overflow: 'hidden' }}>
              <div className="card-header bg-white border-0 py-2 fw-bold small text-start">SERIAL_MONITOR</div>
              <div className="card-body bg-light font-monospace p-3 border-top text-start" style={{ minHeight: '60px', maxHeight: '120px', overflowY: 'auto', fontSize: '0.85rem' }}>
                <div className="d-flex align-items-center">
                   <span className="text-success me-2">✅</span>
                   <span>{terminalLog}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;