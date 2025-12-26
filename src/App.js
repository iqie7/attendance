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

/* ---------------- APP ---------------- */
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

    onValue(ref(db, 'teachers'), s => setTeachers(s.val() || {}));
    onValue(ref(db, 'attendance'), s => setAttendance(s.val() || {}));
    onValue(ref(db, 'terminal_log'), s => setTerminalLog(s.val() || '---'));

    onValue(ref(db, 'latest_scan'), s => {
      if (s.exists()) {
        setRegUid(s.val());
        setIsScanning(false);
      }
    });

    onValue(ref(db, 'config/scan_mode'), s => {
      setIsScanning(s.val() || false);
    });
  }, [user]);

  const handleLogin = e => {
    e.preventDefault();
    signInWithEmailAndPassword(auth, email, password)
      .catch(() => alert('Login Failed'));
  };

  const clearEnrollment = () => {
    remove(ref(db, 'latest_scan'));
    set(ref(db, 'config/scan_mode'), false);
    setRegUid('');
    setRegName('');
    setIsScanning(false);
  };

  const resetDay = () => {
    if (window.confirm("Are you sure you want to reset all attendance for today?")) {
      set(ref(db, 'attendance'), {});
    }
  };

  /* ---------------- LOGIN PAGE ---------------- */
  if (!user) {
    return (
      <div className="vh-100 d-flex justify-content-center align-items-center bg-dark">
        <div className="card p-4 shadow border-0 w-100 mx-3" style={{ maxWidth: 360 }}>
          <div className="text-center mb-3">
            {/* PUBLIC STATIC IMAGE USAGE */}
            <img 
            src={`${process.env.PUBLIC_URL}/logo512.jpg`}              alt="EduTrack Logo" 
              className="img-fluid mb-3" 
              style={{ maxHeight: '80px', borderRadius: '12px' }} 
            />
            <h4 className="fw-bold text-primary">EduTrack Login</h4>
          </div>
          <form onSubmit={handleLogin}>
            <input className="form-control mb-2" placeholder="Email" required onChange={e => setEmail(e.target.value)} />
            <input type="password" className="form-control mb-3" placeholder="Password" required onChange={e => setPassword(e.target.value)} />
            <button className="btn btn-primary w-100">Login</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-vh-100 bg-light d-flex flex-column">

      {/* ---------------- MOBILE TOP BAR ---------------- */}
      <nav className="navbar navbar-dark bg-dark d-md-none px-3">
        <span className="navbar-brand fw-bold">EduTrack</span>
        <button
          className="btn btn-outline-light"
          onClick={() => setShowMobileMenu(!showMobileMenu)}
        >
          ☰
        </button>
      </nav>

      {/* ---------------- MOBILE TOP MENU ---------------- */}
      {showMobileMenu && (
        <div className="bg-dark text-white d-md-none p-3 shadow">
          <button
            className={`btn w-100 mb-2 ${activeTab === 'monitor' ? 'btn-primary' : 'btn-outline-light'}`}
            onClick={() => { setActiveTab('monitor'); setShowMobileMenu(false); }}
          >
            📊 Dashboard
          </button>

          <button
            className={`btn w-100 mb-4 ${activeTab === 'register' ? 'btn-primary' : 'btn-outline-light'}`}
            onClick={() => { setActiveTab('register'); setShowMobileMenu(false); }}
          >
            👤 Enrollment
          </button>
          
          <hr className="bg-secondary" />
          
          <button className="btn btn-outline-warning w-100 mb-2" onClick={resetDay}>
            Reset Day
          </button>
          <button
            className="btn btn-outline-danger w-100"
            onClick={() => signOut(auth)}
          >
            Logout
          </button>
        </div>
      )}

      <div className="d-flex flex-grow-1">

        {/* ---------------- DESKTOP SIDEBAR ---------------- */}
        <div className="bg-dark text-white p-4 d-none d-md-flex flex-column sticky-top"
          style={{ width: 260, height: '100vh' }}>
          <h5 className="fw-bold text-primary mb-4">EduTrack Pro</h5>

          <button className={`btn mb-2 ${activeTab === 'monitor' ? 'btn-primary' : 'btn-outline-light'}`}
            onClick={() => setActiveTab('monitor')}>
            📊 Dashboard
          </button>

          <button className={`btn mb-2 ${activeTab === 'register' ? 'btn-primary' : 'btn-outline-light'}`}
            onClick={() => setActiveTab('register')}>
            👤 Enrollment
          </button>

          {/* Bottom Actions */}
          <div className="mt-auto">
            <button className="btn btn-outline-warning w-100 mb-2" onClick={resetDay}>
              Reset Day
            </button>
            <button className="btn btn-outline-danger w-100" onClick={() => signOut(auth)}>
              Logout
            </button>
          </div>
        </div>

        {/* ---------------- MAIN CONTENT ---------------- */}
        <div className="flex-grow-1 p-3 p-md-4 d-flex flex-column">

          <h4 className="fw-bold mb-3">
            {activeTab === 'monitor' ? 'Live Attendance' : 'Enrollment Center'}
          </h4>

          <div className="flex-grow-1">
            {/* ENROLLMENT */}
            {activeTab === 'register' && (
              <div className="card shadow border-0 mx-auto p-3" style={{ maxWidth: 420 }}>
                {!regUid ? (
                  <>
                    <p className="text-center fw-bold">
                      {isScanning ? '📡 Tap RFID Card' : 'Ready'}
                    </p>
                    <button
                      className="btn btn-primary w-100 mb-2"
                      onClick={() => set(ref(db, 'config/scan_mode'), true)}
                      disabled={isScanning}
                    >
                      Start Scan
                    </button>
                    {isScanning && (
                      <button className="btn btn-outline-danger w-100" onClick={clearEnrollment}>
                        Cancel Scan
                      </button>
                    )}
                  </>
                ) : (
                  <form onSubmit={e => {
                    e.preventDefault();
                    set(ref(db, `teachers/${regUid}`), { name: regName }).then(() => {
                      clearEnrollment();
                      setActiveTab('monitor');
                    });
                  }}>
                    <div className="alert alert-info fw-bold">UID: {regUid}</div>
                    <input
                      className="form-control mb-2"
                      placeholder="Teacher Name"
                      required
                      value={regName}
                      onChange={e => setRegName(e.target.value)}
                    />
                    <button className="btn btn-success w-100 mb-2">Save</button>
                    <button type="button" className="btn btn-outline-danger w-100" onClick={clearEnrollment}>
                      Rescan
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* DASHBOARD */}
            {activeTab === 'monitor' && (
              <div className="card shadow border-0">
                <div className="table-responsive">
                  <table className="table mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>Name</th>
                        <th>UID</th>
                        <th>IN</th>
                        <th>OUT</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.keys(teachers).map(uid => (
                        <tr key={uid}>
                          <td>{teachers[uid].name}</td>
                          <td className="text-muted">{uid}</td>
                          <td>{attendance[uid]?.checkin || '--'}</td>
                          <td>{attendance[uid]?.checkout || '--'}</td>
                          <td>
                            <span className={`badge ${attendance[uid]?.checkin ? 'bg-success' : 'bg-danger'}`}>
                              {attendance[uid]?.checkin ? 'Present' : 'Absent'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* ---------------- TERMINAL AT THE VERY BOTTOM ---------------- */}
          <div className="mt-4">
            <div className="card shadow-sm border-0">
              <div className="card-header fw-bold bg-white">SERIAL_MONITOR</div>
              <div className="card-body font-monospace small bg-light"
                style={{ maxHeight: 150, overflowY: 'auto' }}>
                {terminalLog}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default App;