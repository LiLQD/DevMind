export default function AuthPage({ isLogin, setIsLogin, email, setEmail, password, setPassword, name, setName, onSubmit }) {
  return (
    <div className="auth-page">
      <div className="auth-box">
        <div className="auth-brand">
          <h1>DevMind</h1>
          <p>Your second brain for developers</p>
        </div>
        <form onSubmit={onSubmit} className="auth-form">
          <div>
            <h2>{isLogin ? 'Sign in' : 'Create account'}</h2>
            <p className="auth-note">{isLogin ? 'Access your personal technical knowledge.' : 'Start building your developer knowledge base.'}</p>
          </div>
          {!isLogin && (
            <label>
              <span>Name</span>
              <input type="text" placeholder="Your name" value={name} onChange={e => setName(e.target.value)} required />
            </label>
          )}
          <label>
            <span>Email</span>
            <input type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
          </label>
          <label>
            <span>Password</span>
            <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
          </label>
          <button type="submit" className="primary-btn">{isLogin ? 'Sign in' : 'Create account'}</button>
          <button type="button" className="text-btn auth-switch" onClick={() => setIsLogin(v => !v)}>
            {isLogin ? 'Create an account' : 'Back to sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
