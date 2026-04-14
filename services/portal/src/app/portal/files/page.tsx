'use client';

import { useEffect, useState } from 'react';
import { mockFiles } from '@/lib/mock-data';
import PageHeader from '@/components/PageHeader';

export default function ClientFilesPage() {
  const [userId, setUserId] = useState<string>('');

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => setUserId(data.user?.userId || ''));
  }, []);

  const myFiles = mockFiles.filter(f => f.assignedTo.includes(userId));

  const fileIcon = (type: string) => {
    switch (type) {
      case 'PDF':
        return <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center text-red-500 font-bold text-xs">PDF</div>;
      case 'Excel':
        return <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center text-green-500 font-bold text-xs">XLS</div>;
      default:
        return <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center text-gray-400 font-bold text-xs">FILE</div>;
    }
  };

  return (
    <div>
      <PageHeader title="Files" subtitle="Documents and files shared by LaserNet" />

      {myFiles.length > 0 ? (
        <div className="space-y-3">
          {myFiles.map(file => (
            <div key={file.id} className="card flex items-center gap-4 hover:shadow-md transition-shadow">
              {fileIcon(file.type)}
              <div className="flex-1">
                <p className="font-medium text-sm">{file.name}</p>
                <p className="text-xs text-gray-500">{file.category} • {file.size} • Uploaded {file.uploadedAt}</p>
              </div>
              <button className="btn-secondary text-sm !py-2 !px-4 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="card text-center py-12">
          <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
          </svg>
          <p className="text-gray-500">No files available yet.</p>
        </div>
      )}
    </div>
  );
}
