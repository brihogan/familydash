import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSun, faMoon } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';

export default function LoginPage() {
  const { login } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const savedEmail = localStorage.getItem('rememberedEmail') || '';
  const savedUsername = localStorage.getItem('rememberedUsername') || '';
  const savedTab = localStorage.getItem('loginTab');
  const [tab, setTab] = useState(savedTab === 'kid' || savedTab === 'parent' ? savedTab : (savedUsername && !savedEmail ? 'kid' : 'parent'));
  const [email, setEmail] = useState(savedEmail);
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState(savedUsername);
  const [pin, setPin] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const creds = tab === 'parent' ? { email, password, rememberMe } : { username, pin, rememberMe };
      await login(creds);
      localStorage.setItem('loginTab', tab);
      if (rememberMe) {
        if (tab === 'parent') {
          localStorage.setItem('rememberedEmail', email);
          localStorage.removeItem('rememberedUsername');
        } else {
          localStorage.setItem('rememberedUsername', username);
          localStorage.removeItem('rememberedEmail');
        }
      } else {
        localStorage.removeItem('rememberedEmail');
        localStorage.removeItem('rememberedUsername');
      }
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-purple-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4 relative">
      <button
        onClick={toggleTheme}
        className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-300 hover:text-brand-600 dark:hover:text-brand-300 shadow-sm transition-colors"
        title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        <FontAwesomeIcon icon={isDark ? faSun : faMoon} />
      </button>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-8">
        <h1 className="text-2xl font-bold text-center text-gray-800 dark:text-gray-200 mb-2">Family Dashboard</h1>
        <p className="text-sm text-center text-gray-500 dark:text-gray-400 mb-6">Sign in to your account</p>

        {/* Tabs */}
        <div className="flex rounded-lg bg-gray-100 dark:bg-gray-700 p-1 mb-6">
          <button
            onClick={() => setTab('parent')}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${
              tab === 'parent' ? 'bg-white dark:bg-gray-600 shadow text-brand-600 dark:text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            Parent
          </button>
          <button
            onClick={() => setTab('kid')}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${
              tab === 'kid' ? 'bg-white dark:bg-gray-600 shadow text-brand-600 dark:text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            Kid
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {tab === 'parent' ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 dark:bg-gray-700 dark:text-gray-200"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 dark:bg-gray-700 dark:text-gray-200"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 dark:bg-gray-700 dark:text-gray-200"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">PIN (4 digits)</label>
                <input
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  required
                  maxLength={4}
                  pattern="\d{4}"
                  placeholder="••••"
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-brand-400 dark:bg-gray-700 dark:text-gray-200"
                />
              </div>
            </>
          )}

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-brand-500 focus:ring-brand-400"
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">Remember me</span>
          </label>

          {error && <p className="text-sm text-red-500 text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-500 hover:bg-brand-600 text-white py-2.5 rounded-lg font-medium disabled:opacity-60 transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
          New family?{' '}
          <Link to="/register" className="text-brand-600 hover:underline font-medium">
            Register here
          </Link>
        </p>
      </div>
    </div>
  );
}
