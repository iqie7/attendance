import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import {
  getDatabase,
  ref,
  onValue,
  set,
  remove
} from 'firebase/database';
import 'bootstrap/dist/css/bootstrap.min.css';

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
  const [regUid, setRegUid] = useState('');
  const [regName, setRegName] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [terminalLog, setTerminalLog] = useState('Waiting for hardware...');
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  useEffect(() => {
    onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!user) return;

    onValue(ref(db, 'teachers'), snap => setTeachers(snap.val() || {}));
    onValue(ref(db, 'attendance'), snap => setAttendance(snap.val() || {}));
    onValue(ref(db, 'terminal_log'), snap => setTerminalLog(snap.val() || '---'));
    onValue(ref(db, 'latest_scan'), snap => {
      if (snap.exists()) {
        setRegUid(snap.val());
        setIsScanning(false);
      }
    });
    onValue(ref(db, 'config/scan_mode'), snap => setIsScanning(snap.val() || false));
  }, [user]);

  const handleLogin = e => {
    e.preventDefault();
    signInWithEmailAndPassword(auth, email, password).catch(() => alert('Login Failed'));
  };

  if (!user) {
    return (
      <div className="d-flex justify-content-center align-items-center bg-dark" style={{ height: '100vh' }}>
        <div className="card p-4 shadow-lg border-0" style={{ width: '350px', borderRadius: '15px' }}>
          <div className="text-center mb-4 text-dark">
            <h3 className="fw-bold text-primary">EduTrack Login</h3>
          </div>
          <form onSubmit={handleLogin}>
            <input type="email" className="form-control mb-2" placeholder="Email" onChange={e => setEmail(e.target.value)} required />
            <input type="password" className="form-control mb-3" placeholder="Password" onChange={e => setPassword(e.target.value)} required />
            <button className="btn btn-primary w-100 fw-bold">Login</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="d-flex flex-column flex-md-row" style={{ minHeight: '100vh', background: '#f4f7f6' }}>

      {/* Mobile Top Bar */}
      <div className="d-md-none bg-dark text-white d-flex justify-content-between align-items-center p-3 shadow-sm">
        <span className="fw-bold text-primary">EduTrack Pro</span>
        <button className="btn btn-outline-light btn-sm" onClick={() => setShowMobileMenu(!showMobileMenu)}>☰</button>
      </div>

      {/* Mobile Menu */}
      {showMobileMenu && (
        <div className="d-md-none bg-dark text-white p-3 shadow-sm">
          <button className="btn btn-primary w-100 mb-2" onClick={() => { setActiveTab('monitor'); setShowMobileMenu(false); }}>📊 Dashboard</button>
          <button className="btn btn-primary w-100 mb-2" onClick={() => { setActiveTab('register'); setShowMobileMenu(false); }}>👤 Add User</button>
          <button className="btn btn-outline-danger w-100 mb-2" onClick={() => { window.confirm("Reset Attendance?") && remove(ref(db, 'attendance')); setShowMobileMenu(false); }}>Reset Day</button>
          <button className="btn btn-link text-light w-100" onClick={() => signOut(auth)}>Logout</button>
        </div>
      )}

      {/* Sidebar */}
      <div className="p-4 text-white d-none d-md-flex flex-column shadow" style={{ width: '280px', background: '#111827' }}>
        <h4 className="fw-bold text-primary mb-5">EduTrack Pro</h4>
        <nav className="nav flex-column gap-2 flex-grow-1">
          <button className={`btn text-start p-3 border-0 rounded-3 ${activeTab === 'monitor' ? 'btn-primary text-white' : 'text-secondary bg-transparent'}`} onClick={() => setActiveTab('monitor')}>
            📊 &nbsp; Dashboard
          </button>
          <button className={`btn text-start p-3 border-0 rounded-3 ${activeTab === 'register' ? 'btn-primary text-white' : 'text-secondary bg-transparent'}`} onClick={() => setActiveTab('register')}>
            👤 &nbsp; Add User
          </button>
        </nav>
        <button className="btn btn-outline-danger btn-sm w-100 mb-2 mt-auto" onClick={() => window.confirm("Reset Attendance?") && remove(ref(db, 'attendance'))}>Reset Day</button>
        <button className="btn btn-link text-secondary btn-sm text-decoration-none" onClick={() => signOut(auth)}>Logout</button>
      </div>

      {/* Main Content */}
      <div className="flex-grow-1 p-3 p-md-4 d-flex flex-column overflow-auto">
        <h2 className="fw-bold mb-4 text-dark">{activeTab === 'monitor' ? "Live Attendance Monitoring" : "Enrollment Center"}</h2>

        {activeTab === 'monitor' ? (
          <div className="card border-0 shadow-sm rounded-4 overflow-hidden mb-4">
            <div className="table-responsive">
              <table className="table align-middle mb-0 bg-white">
                <thead className="table-light">
                  <tr className="text-muted small fw-bold">
                    <th className="ps-4 py-3">TEACHER NAME</th>
                    <th>UID</th>
                    <th>IN</th>
                    <th>OUT</th>
                    <th>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(teachers).map(uid => (
                    <tr key={uid}>
                      <td className="ps-4 py-3 fw-bold">{teachers[uid].name}</td>
                      <td className="text-muted small font-monospace">{uid}</td>
                      <td className="text-success fw-bold">{attendance[uid]?.checkin || '--:--'}</td>
                      <td className="text-muted">{attendance[uid]?.checkout || '--:--'}</td>
                      <td>
                        <span className={`badge rounded-pill px-3 py-2 ${attendance[uid]?.checkin ? 'bg-success' : 'bg-danger-subtle text-danger'}`}>
                          {attendance[uid]?.checkin ? 'Present' : 'Absent'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="card shadow border-0 p-5 mx-auto text-center mb-4 bg-white" style={{ maxWidth: '500px', borderRadius: '20px' }}>
            {!regUid ? (
              <div className="py-4 text-dark">
                <h5 className="fw-bold mb-3">{isScanning ? "📡 Scanning Hardware..." : "Ready to Register"}</h5>
                <button className="btn btn-primary btn-lg shadow-sm px-5 w-100 w-md-auto" onClick={() => set(ref(db, 'config/scan_mode'), true)} disabled={isScanning}>
                  {isScanning ? "Tap Card Now" : "Start Registration Scan"}
                </button>
              </div>
            ) : (
              <form onSubmit={(e) => {
                e.preventDefault();
                set(ref(db, `teachers/${regUid}`), { name: regName }).then(() => {
                  remove(ref(db, 'latest_scan')); setRegName(''); setRegUid(''); setActiveTab('monitor');
                });
              }}>
                <div className="alert alert-info border-0 shadow-sm fw-bold mb-4">UID: {regUid}</div>
                <input className="form-control form-control-lg bg-light border-0 mb-3" placeholder="Teacher Full Name" value={regName} onChange={e => setRegName(e.target.value)} required />
                <button className="btn btn-success btn-lg w-100 fw-bold">Save Profile</button>
              </form>
            )}
          </div>
        )}

        {/* Terminal Log */}
        <div className="mt-auto">
          <div className="card border-0 shadow rounded-3 overflow-hidden bg-white border border-secondary">
            <div className="bg-light border-bottom px-3 py-2 small fw-bold text-dark font-monospace">
              SERIAL_MONITOR_BRIDGE
            </div>
            <div className="card-body p-3 font-monospace bg-white">
              <span className="text-primary fw-bold">[{new Date().toLocaleTimeString()}]</span>
              <span className="ms-2 text-dark fw-bold">{terminalLog}</span>
              <span className="ms-1 border-start border-dark border-2 animate-pulse">_</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
