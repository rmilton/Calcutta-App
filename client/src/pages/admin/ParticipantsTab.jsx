import React, { useState, useEffect } from 'react';
import ParticipantAvatar from '../../components/ParticipantAvatar';
import { api } from '../../utils';

export default function ParticipantsTab() {
  const [participants, setParticipants] = useState([]);

  useEffect(() => {
    api('/admin/participants').then((r) => r.json()).then(setParticipants);
  }, []);

  const remove = async (id) => {
    if (!confirm('Remove this participant?')) return;
    await api(`/admin/participants/${id}`, { method: 'DELETE' });
    setParticipants((p) => p.filter((x) => x.id !== id));
  };

  return (
    <div className="space-y-2 max-w-md">
      {participants.map((p) => (
        <div key={p.id} className="flex items-center justify-between bg-slate-800 rounded-lg px-4 py-3">
          <div className="flex items-center gap-3">
            <ParticipantAvatar name={p.name} color={p.color} size={28} ring={false} />
            <div>
              <div className="text-white font-medium text-sm">{p.name}</div>
              {p.is_admin ? <span className="text-xs text-orange-400">Admin</span> : null}
            </div>
          </div>
          {!p.is_admin && (
            <button onClick={() => remove(p.id)} className="text-slate-500 hover:text-red-400 text-xs transition-colors">
              Remove
            </button>
          )}
        </div>
      ))}
      {participants.length === 0 && <p className="text-slate-400 text-sm">No participants yet.</p>}
    </div>
  );
}
