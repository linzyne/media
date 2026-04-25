import React, { useState, useEffect, useRef } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { UploadCloud, FileVideo, Download, Loader2, ArrowRight, X } from 'lucide-react';

function App() {
  const [loaded, setLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const ffmpegRef = useRef(new FFmpeg());
  const messageRef = useRef(null);

  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [webpUrl, setWebpUrl] = useState(null);
  
  const [isConverting, setIsConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [eta, setEta] = useState('');

  // 설정 옵션
  const [fps, setFps] = useState(15);
  const [quality, setQuality] = useState(50); // 0-100 (webp qscale 변환 활용)
  const [scale, setScale] = useState(480); // width 기본값

  const loadFFmpeg = async () => {
    setIsLoading(true);
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
    const ffmpeg = ffmpegRef.current;
    
    ffmpeg.on('log', ({ message }) => {
      console.log('FFmpeg:', message);
    });

    ffmpeg.on('progress', ({ progress, time }) => {
      setProgress(Math.round(progress * 100));
    });

    try {
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });
      setLoaded(true);
    } catch (e) {
      console.error('Error loading ffmpeg', e);
      alert('FFmpeg 로딩에 실패했습니다. 인터넷 연결을 확인해주세요.');
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadFFmpeg();
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('video/')) {
      setVideoFile(file);
      setVideoUrl(URL.createObjectURL(file));
      setWebpUrl(null);
      setProgress(0);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('video/')) {
      setVideoFile(file);
      setVideoUrl(URL.createObjectURL(file));
      setWebpUrl(null);
      setProgress(0);
    }
  };

  const clearFile = () => {
    setVideoFile(null);
    setVideoUrl(null);
    setWebpUrl(null);
    setProgress(0);
  };

  const convertToWebP = async () => {
    if (!videoFile) return;
    
    setIsConverting(true);
    setProgress(0);
    const ffmpeg = ffmpegRef.current;
    const inputName = 'input_video.mp4';
    const outputName = 'output_animated.webp';

    try {
      // 1. Write file to FFmpeg WASM FS
      await ffmpeg.writeFile(inputName, await fetchFile(videoFile));

      // 2. Run conversion
      // -vf scale=... : 오리지널 프레임 속도를 유지하여 '느려지거나 끊기는' 현상 제거. format=bgra로 색감 원본 유지
      // -q:v : FFmpeg 표준 화질 옵션 유지
      await ffmpeg.exec([
        '-i', inputName,
        '-vcodec', 'libwebp',
        '-vf', `scale=${scale}:-1:flags=lanczos,format=yuv420p`, // 색감 보존 및 부드러운 화질 리사이즈 (속도 저하 원인인 프레임 강제 조절 제거)
        '-q:v', quality.toString(), 
        '-lossless', '0',
        '-loop', '0',
        '-an', // 오디오 제거
        outputName
      ]);

      // 3. Read result
      const data = await ffmpeg.readFile(outputName);
      const url = URL.createObjectURL(new Blob([data.buffer], { type: 'image/webp' }));
      setWebpUrl(url);

    } catch (e) {
      console.error('Conversion Failed:', e);
      alert('변환 중 오류가 발생했습니다.');
    } finally {
      setIsConverting(false);
      setProgress(100);
    }
  };

  return (
    <div className="container animate-fade-in">
      <div className="header">
        <h1>비디오를 WebP 움짤로 🚀</h1>
        <p>서버 업로드 없이 브라우저에서 안전하고 빠르게 변환하세요.</p>
      </div>

      <div className="glass" style={{ padding: '2rem', borderRadius: '1.5rem' }}>
        
        {!videoFile ? (
          <div 
            className="upload-area" 
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => document.getElementById('file-upload').click()}
          >
            <UploadCloud className="upload-icon" />
            <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>동영상 파일을 여기에 드래그하거나 클릭하여 업로드</h3>
            <p style={{ color: 'var(--text-secondary)' }}>MP4, WebM, MOV 포맷 지원</p>
            <input 
              id="file-upload" 
              type="file" 
              accept="video/*" 
              style={{ display: 'none' }} 
              onChange={handleFileChange}
            />
          </div>
        ) : (
          <div className="animate-fade-in">
            <div className="file-info">
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <FileVideo style={{ color: 'var(--accent)' }} size={32} />
                <div>
                  <h4 style={{ fontWeight: 600 }}>{videoFile.name}</h4>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    {(videoFile.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </div>
              </div>
              <button className="btn btn-danger" onClick={clearFile} disabled={isConverting} style={{ padding: '0.5rem', borderRadius: '0.5rem' }}>
                <X size={20} />
              </button>
            </div>

            <div className="options-panel">
              <div className="option-group">
                <label>해상도 너비 (Width: {scale}px)</label>
                <input type="range" min="200" max="800" step="10" value={scale} onChange={(e) => setScale(e.target.value)} disabled={isConverting} />
              </div>
              <div className="option-group">
                <label>프레임 속도 (FPS: {fps})</label>
                <input type="range" min="5" max="30" step="1" value={fps} onChange={(e) => setFps(e.target.value)} disabled={isConverting} />
              </div>
              <div className="option-group">
                <label>퀄리티 ({quality}%)</label>
                <input type="range" min="10" max="100" step="5" value={quality} onChange={(e) => setQuality(e.target.value)} disabled={isConverting} />
              </div>
            </div>

            {!webpUrl && (
              <div style={{ marginTop: '2rem', textAlign: 'center' }}>
                <button 
                  className="btn" 
                  onClick={convertToWebP} 
                  disabled={!loaded || isConverting}
                  style={{ width: '100%', justifyContent: 'center', padding: '1rem' }}
                >
                  {isLoading ? (
                    <><Loader2 className="animate-spin" /> 변환 모듈 로딩 중...</>
                  ) : isConverting ? (
                    <><Loader2 className="animate-spin" /> 변환 중... ({progress}%)</>
                  ) : (
                    <>✨ WebP로 변환 시작하기 <ArrowRight size={20} /></>
                  )}
                </button>

                {isConverting && (
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${progress}%` }}></div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {webpUrl && (
          <div className="animate-fade-in" style={{ marginTop: '2rem', borderTop: '1px solid var(--card-border)', paddingTop: '2rem' }}>
            <h3 style={{ textAlign: 'center', marginBottom: '1.5rem' }}>🎉 변환 완료!</h3>
            <div className="preview-container">
              <img src={webpUrl} alt="Converted WebP" />
            </div>
            
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', justifyContent: 'center' }}>
              <a href={webpUrl} download={`${videoFile.name.split('.')[0]}_animated.webp`} style={{ textDecoration: 'none' }}>
                <button className="btn btn-success">
                  <Download size={20} /> 다운로드
                </button>
              </a>
              <button className="btn btn-danger" onClick={clearFile}>
                새로 만들기
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
