'use client';

import { mockFiles, mockVideos } from '@/lib/mock-data';
import { useLanguage } from '@/lib/LanguageContext';

export default function AdminFilesPage() {
  const { t } = useLanguage();

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('files', 'title')}</h1>
          <p className="text-gray-500 mt-1">{t('files', 'subtitle')}</p>
        </div>
        <button className="btn-primary flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          {t('files', 'uploadFile')}
        </button>
      </div>

      {/* Files Table */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold mb-4">{t('files', 'documents')}</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-gray-200">
              <tr>
                <th className="text-left pb-3 text-xs font-medium text-gray-500 uppercase">{t('files', 'fileName')}</th>
                <th className="text-left pb-3 text-xs font-medium text-gray-500 uppercase">{t('common', 'type')}</th>
                <th className="text-left pb-3 text-xs font-medium text-gray-500 uppercase">{t('common', 'size')}</th>
                <th className="text-left pb-3 text-xs font-medium text-gray-500 uppercase">{t('files', 'category')}</th>
                <th className="text-left pb-3 text-xs font-medium text-gray-500 uppercase">{t('files', 'uploaded')}</th>
                <th className="text-right pb-3 text-xs font-medium text-gray-500 uppercase">{t('common', 'actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {mockFiles.map((file) => (
                <tr key={file.id} className="hover:bg-gray-50">
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="font-medium text-sm">{file.name}</span>
                    </div>
                  </td>
                  <td className="py-3 text-sm text-gray-600">{file.type}</td>
                  <td className="py-3 text-sm text-gray-600">{file.size}</td>
                  <td className="py-3">
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">{file.category}</span>
                  </td>
                  <td className="py-3 text-sm text-gray-500">{file.uploadedAt}</td>
                  <td className="py-3 text-right">
                    <button className="text-brand-600 hover:text-brand-700 text-sm font-medium mr-3">{t('common', 'edit')}</button>
                    <button className="text-red-500 hover:text-red-600 text-sm font-medium">{t('common', 'delete')}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Videos */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">{t('files', 'videos')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {mockVideos.map((video) => (
            <div key={video.id} className="border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
              <div className="aspect-video bg-gray-100 flex items-center justify-center">
                <svg className="w-12 h-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="p-4">
                <h3 className="font-medium text-sm">{video.title}</h3>
                <p className="text-xs text-gray-500 mt-1">{video.category} • {video.uploadedAt}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
