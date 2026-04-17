'use client';

import { useEffect, useState } from 'react';
import { mockVideos, type Video } from '@/lib/mock-data';
import PageHeader from '@/components/PageHeader';

export default function ClientVideosPage() {
  const [userId, setUserId] = useState<string>('');
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [filter, setFilter] = useState<string>('All');

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => setUserId(data.user?.userId || ''));
  }, []);

  const myVideos = mockVideos.filter(v => v.assignedTo.includes(userId));
  const categories = ['All', ...Array.from(new Set(myVideos.map(v => v.category)))];
  const filteredVideos = filter === 'All' ? myVideos : myVideos.filter(v => v.category === filter);

  return (
    <div>
      <PageHeader title="Videos" subtitle="Training videos and tutorials from LaserNet" />

      {/* Category Filter */}
      <div className="flex gap-2 mb-6">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === cat
                ? 'bg-brand-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Video Grid */}
      {filteredVideos.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredVideos.map(video => (
            <div
              key={video.id}
              onClick={() => setSelectedVideo(video)}
              className="card !p-0 overflow-hidden cursor-pointer hover:shadow-md transition-shadow group"
            >
              <div className="aspect-video bg-gray-900 flex items-center justify-center relative">
                <svg className="w-16 h-16 text-white/80 group-hover:text-white group-hover:scale-110 transition-all" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                </svg>
                <div className="absolute top-3 right-3">
                  <span className="bg-black/60 text-white text-xs px-2 py-1 rounded">{video.category}</span>
                </div>
              </div>
              <div className="p-4">
                <h3 className="font-semibold text-sm mb-1">{video.title}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{video.description}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">{video.uploadedAt}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card text-center py-12">
          <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <p className="text-gray-500 dark:text-gray-400">No videos available yet.</p>
        </div>
      )}

      {/* Video Player Modal */}
      {selectedVideo && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setSelectedVideo(null)}>
          <div className="max-w-4xl w-full" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-white">{selectedVideo.title}</h2>
              <button onClick={() => setSelectedVideo(null)} className="text-white/80 hover:text-white">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="aspect-video bg-black rounded-xl overflow-hidden">
              <iframe
                width="100%"
                height="100%"
                src={`https://www.youtube.com/embed/${selectedVideo.youtubeId}?autoplay=1`}
                title={selectedVideo.title}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
            <p className="text-gray-300 text-sm mt-4">{selectedVideo.description}</p>
          </div>
        </div>
      )}
    </div>
  );
}
