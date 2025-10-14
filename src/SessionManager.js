export class SessionManager {
  constructor() {
    this.sessions = JSON.parse(localStorage.getItem('mcp_sessions') || '{}');
  }

  createSession(mcpId, mcpConfig) {
    if (!this.sessions[mcpId]) {
      this.sessions[mcpId] = [];
    }

    const sessionLimit = mcpConfig.sessionLimit || null;
    if (sessionLimit && this.sessions[mcpId].length >= sessionLimit) {
      throw new Error(`Maximum sessions reached for ${mcpConfig.name} (${this.sessions[mcpId].length}/${sessionLimit})`);
    }

    let port = null;
    if (mcpConfig.usesDedicatedPorts) {
      const availablePorts = this.getAvailablePorts(mcpId);
      if (availablePorts.length === 0) {
        throw new Error('No available server ports');
      }
      port = availablePorts[0];
    }

    const session = {
      id: Date.now().toString(),
      mcpId,
      mcpConfig,
      port,
      status: 'active',
      hasExecuted: false,
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString()
    };

    this.sessions[mcpId].push(session);
    this.save();
    return session;
  }

  getAvailablePorts(mcpId) {
    const allPorts = [
      { xpra: 10000, proxy: 8882 },
      { xpra: 10001, proxy: 8883 },
      { xpra: 10002, proxy: 8884 },
      { xpra: 10003, proxy: 8885 }
    ];

    const mcpSessions = this.sessions[mcpId] || [];
    const usedProxyPorts = mcpSessions.map(s => s.port?.proxy).filter(Boolean);
    return allPorts.filter(p => !usedProxyPorts.includes(p.proxy));
  }

  releaseSession(mcpId, sessionId) {
    if (this.sessions[mcpId]) {
      this.sessions[mcpId] = this.sessions[mcpId].filter(s => s.id !== sessionId);
      this.save();
    }
  }

  getSession(mcpId, sessionId) {
    return this.sessions[mcpId]?.find(s => s.id === sessionId);
  }

  getSessions(mcpId) {
    return this.sessions[mcpId] || [];
  }

  getAllSessions() {
    return this.sessions;
  }

  updateActivity(mcpId, sessionId) {
    const sessions = this.sessions[mcpId];
    if (sessions) {
      const session = sessions.find(s => s.id === sessionId);
      if (session) {
        session.lastActivity = new Date().toISOString();
        this.save();
      }
    }
  }

  save() {
    localStorage.setItem('mcp_sessions', JSON.stringify(this.sessions));
  }
}
