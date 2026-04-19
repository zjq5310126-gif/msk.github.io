/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { 
  Upload, 
  Download, 
  RotateCcw,
  Eraser,
  Brush,
  Settings2,
  Maximize
} from 'lucide-react';
import { motion } from 'motion/react';

const CANVAS_MAX_WIDTH = 1024;
const CANVAS_MAX_HEIGHT = 768;

export default function App() {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [pixelScale, setPixelScale] = useState(24);
  const [textureDepth, setTextureDepth] = useState(0.84); // 0 to 1
  const [brushRadius, setBrushRadius] = useState(40);
  const [isBrushing, setIsBrushing] = useState(false);
  const [mask, setMask] = useState<Uint8Array | null>(null);
  const [view, setView] = useState<'canvas' | 'gallery'>('canvas');
  
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const ratio = Math.min(CANVAS_MAX_WIDTH / img.width, CANVAS_MAX_HEIGHT / img.height, 1);
          const w = Math.floor(img.width * ratio);
          const h = Math.floor(img.height * ratio);
          setImage(img);
          setMask(new Uint8Array(w * h).fill(0));
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    multiple: false
  });

  const renderMosaic = useCallback(() => {
    if (!image || !displayCanvasRef.current || !mask) return;

    const canvas = displayCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const ratio = Math.min(CANVAS_MAX_WIDTH / image.width, CANVAS_MAX_HEIGHT / image.height, 1);
    const width = Math.floor(image.width * ratio);
    const height = Math.floor(image.height * ratio);

    canvas.width = width;
    canvas.height = height;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;
    tempCtx.drawImage(image, 0, 0, width, height);
    const imgData = tempCtx.getImageData(0, 0, width, height);

    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);

    const step = Math.max(4, pixelScale);
    
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        let maskSum = 0;
        for(let my = Math.floor(y); my < Math.min(height, y + step); my++) {
          for(let mx = Math.floor(x); mx < Math.min(width, x + step); mx++) {
            const mIdx = my * width + mx;
            if (mIdx < mask.length && mask[mIdx] > 0) {
              maskSum++;
            }
          }
        }
        
        if (maskSum > (step * step) * 0.1) {
          let r = 0, g = 0, b = 0, count = 0;
          for (let by = y; by < Math.min(y + step, height); by++) {
            for (let bx = x; bx < Math.min(x + step, width); bx++) {
              const idx = (Math.floor(by) * Math.floor(width) + Math.floor(bx)) * 4;
              r += imgData.data[idx];
              g += imgData.data[idx + 1];
              b += imgData.data[idx + 2];
              count++;
            }
          }
          r = Math.floor(r / count);
          g = Math.floor(g / count);
          b = Math.floor(b / count);

          const depth = step * textureDepth * 0.5;
          
          // Shading for 3D effect
          ctx.fillStyle = `rgb(${r * 0.7}, ${g * 0.7}, ${b * 0.7})`;
          ctx.beginPath();
          ctx.moveTo(x + step, y);
          ctx.lineTo(x + step + depth, y - depth);
          ctx.lineTo(x + step + depth, y + step - depth);
          ctx.lineTo(x + step, y + step);
          ctx.fill();

          ctx.fillStyle = `rgb(${Math.min(255, r * 1.2)}, ${Math.min(255, g * 1.2)}, ${Math.min(255, b * 1.2)})`;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + depth, y - depth);
          ctx.lineTo(x + step + depth, y - depth);
          ctx.lineTo(x + step, y);
          ctx.fill();

          ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
          ctx.fillRect(x, y, step, step);
          ctx.strokeStyle = `rgba(255,255,255,0.05)`;
          ctx.strokeRect(x, y, step, step);
        }
      }
    }
  }, [image, mask, pixelScale, textureDepth]);

  useEffect(() => {
    renderMosaic();
  }, [renderMosaic]);

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsBrushing(true);
    applyBrush(e);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isBrushing) {
      applyBrush(e);
    }
  };

  const handlePointerUp = () => {
    setIsBrushing(false);
  };

  const applyBrush = (e: React.PointerEvent) => {
    if (!displayCanvasRef.current || !mask) return;
    const canvas = displayCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);

    const newMask = new Uint8Array(mask);
    const radius = brushRadius;
    const width = canvas.width;
    const height = canvas.height;

    for (let i = Math.max(0, Math.floor(y - radius)); i < Math.min(height, Math.floor(y + radius)); i++) {
      for (let j = Math.max(0, Math.floor(x - radius)); j < Math.min(width, Math.floor(x + radius)); j++) {
        const dx = j - x;
        const dy = i - y;
        if (dx * dx + dy * dy <= radius * radius) {
          const mIdx = i * width + j;
          if (mIdx < newMask.length) {
            newMask[mIdx] = 1;
          }
        }
      }
    }
    setMask(newMask);
  };

  const smartDetect = () => {
    if (!image || !displayCanvasRef.current || !mask) return;
    const canvas = displayCanvasRef.current;
    const width = canvas.width;
    const height = canvas.height;
    
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;
    tempCtx.drawImage(image, 0, 0, width, height);
    const imgData = tempCtx.getImageData(0, 0, width, height).data;

    const newMask = new Uint8Array(width * height);
    for (let i = 0; i < height; i++) {
      for (let j = 0; j < width; j++) {
        const idx = (i * width + j) * 4;
        const lum = (0.299 * imgData[idx] + 0.587 * imgData[idx + 1] + 0.114 * imgData[idx + 2]);
        if (lum < 240) newMask[i * width + j] = 1;
      }
    }
    setMask(newMask);
  };

  const downloadImage = () => {
    if (!displayCanvasRef.current) return;
    const link = document.createElement('a');
    link.download = 'mosaic-studio-export.png';
    link.href = displayCanvasRef.current.toDataURL();
    link.click();
  };

  return (
    <div className="h-screen bg-[#0A0A0A] text-white flex flex-col overflow-hidden font-sans selection:bg-[#FF4D00]">
      {/* Header Section */}
      <header className="flex justify-between items-end p-8 border-b border-white/10 shrink-0">
        <div>
          <h1 className="text-5xl font-serif tracking-tighter leading-none uppercase">MOSAIC<br />STUDIO</h1>
          <p className="text-[10px] uppercase tracking-[0.4em] mt-4 opacity-50">Pixel Reconstruction Engine v2.4</p>
        </div>
        <div className="hidden md:flex gap-8 text-[11px] uppercase tracking-widest font-medium">
          <span className={`pb-1 cursor-pointer transition-all ${view === 'canvas' ? 'border-b border-white' : 'opacity-40 hover:opacity-100'}`} onClick={() => setView('canvas')}>Canvas</span>
          <span className={`pb-1 cursor-pointer transition-all ${view === 'gallery' ? 'border-b border-white' : 'opacity-40 hover:opacity-100'}`} onClick={() => setView('gallery')}>Gallery</span>
          <button onClick={downloadImage} className="opacity-40 hover:opacity-100 transition-opacity cursor-pointer uppercase">Export</button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Sidebar Tools */}
        <aside className="w-24 border-r border-white/10 flex flex-col items-center py-12 gap-10 shrink-0">
          <div 
            onClick={() => setImage(null)}
            title="Reset Workspace"
            className="w-10 h-10 border border-white/20 flex items-center justify-center opacity-40 hover:opacity-100 hover:border-white transition-all cursor-pointer group"
          >
            <RotateCcw className="w-5 h-5 group-active:rotate-[-90deg] transition-transform" />
          </div>
          <div className="w-12 h-12 bg-white text-black flex items-center justify-center rounded-sm relative shadow-[0_0_20px_rgba(255,255,255,0.1)]">
            <Brush className="w-6 h-6" />
            <div className="absolute -right-1 top-0 w-1 h-full bg-[#FF4D00]"></div>
          </div>
          <div 
            onClick={() => setMask(new Uint8Array(mask?.length || 0).fill(0))}
            title="Clear Mosaic"
            className="w-10 h-10 border border-white/20 flex items-center justify-center opacity-40 hover:opacity-100 hover:border-white transition-all cursor-pointer"
          >
            <Eraser className="w-5 h-5" />
          </div>
        </aside>

        {/* Main Workspace */}
        <section className="flex-1 relative bg-[#111111] overflow-hidden group">
          <div className="absolute inset-0 flex items-center justify-center p-12">
            <div className="relative w-full h-full border border-white/5 flex items-center justify-center overflow-hidden">
              {/* Radial Dot Grid Background */}
              <div 
                className="absolute inset-0 opacity-20 pointer-events-none" 
                style={{ backgroundImage: 'radial-gradient(#333 1px, transparent 0)', backgroundSize: '32px 32px' }}
              />
              
              {!image ? (
                <div 
                  {...getRootProps()} 
                  className="relative w-full h-full flex flex-col items-center justify-center transition-all cursor-pointer group/upload"
                >
                  <input {...getInputProps()} />
                  <div className="w-24 h-24 border border-dashed border-white/20 flex items-center justify-center mb-6 group-hover/upload:border-white/60 group-hover/upload:scale-105 transition-all">
                    <Upload className="opacity-20 group-hover/upload:opacity-60 transition-opacity" size={32} />
                  </div>
                  <p className="text-[10px] uppercase tracking-[0.4em] opacity-40 group-hover/upload:opacity-80 transition-opacity">Import Source Object</p>
                </div>
              ) : (
                <div className="relative shadow-[0_50px_100px_rgba(0,0,0,0.5)] bg-neutral-900 overflow-hidden cursor-crosshair">
                  <canvas 
                    ref={displayCanvasRef}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerLeave={handlePointerUp}
                    style={{ touchAction: 'none' }}
                    className="block"
                  />
                  
                  {isBrushing && (
                    <div className="absolute top-6 left-6 flex items-center gap-3 bg-black/80 backdrop-blur-md px-4 py-2 border border-white/10 pointer-events-none">
                      <div className="w-2 h-2 bg-[#FF4D00] animate-pulse"></div>
                      <span className="text-[9px] font-mono tracking-[0.2em] text-[#FF4D00] uppercase">Mosaic Eraser Active</span>
                    </div>
                  )}
                  
                  <div className="absolute bottom-6 left-6 text-[9px] opacity-30 font-mono uppercase tracking-[0.3em] flex gap-4 pointer-events-none">
                    <span>{displayCanvasRef.current?.width}x{displayCanvasRef.current?.height}</span>
                    <span className="opacity-40">|</span>
                    <span>Buffer_RT_01</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Right Adjustment Panel */}
        <aside className="w-80 border-l border-white/10 p-10 flex flex-col gap-12 shrink-0 overflow-y-auto">
          <div>
            <h3 className="text-[10px] uppercase tracking-[0.3em] mb-10 opacity-40 font-bold">Parameters</h3>
            
            <div className="space-y-12">
              {/* Pixel Scale */}
              <div className="space-y-5">
                <div className="flex justify-between text-[11px] uppercase tracking-[0.2em] font-mono">
                  <span className="opacity-40">Pixel Scale</span>
                  <span className="text-[#FF4D00]">{pixelScale}px</span>
                </div>
                <input 
                  type="range" 
                  min="8" 
                  max="120" 
                  value={pixelScale} 
                  onChange={(e) => setPixelScale(parseInt(e.target.value))}
                />
              </div>

              {/* Texture Depth */}
              <div className="space-y-5">
                <div className="flex justify-between text-[11px] uppercase tracking-[0.2em] font-mono">
                  <span className="opacity-40">Surface Depth</span>
                  <span className="text-[#FF4D00]">{Math.round(textureDepth * 100)}%</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={textureDepth * 100} 
                  onChange={(e) => setTextureDepth(parseInt(e.target.value) / 100)}
                />
              </div>

              {/* Brush Size */}
              <div className="space-y-5">
                <div className="flex justify-between text-[11px] uppercase tracking-[0.2em] font-mono">
                  <span className="opacity-40">Eraser Radius</span>
                  <span className="text-[#FF4D00]">{brushRadius}px</span>
                </div>
                <input 
                  type="range" 
                  min="10" 
                  max="300" 
                  value={brushRadius} 
                  onChange={(e) => setBrushRadius(parseInt(e.target.value))}
                />
              </div>
            </div>
          </div>

          <div className="mt-auto space-y-4">
            <button 
              onClick={() => {
                if(!displayCanvasRef.current) return;
                const length = displayCanvasRef.current.width * displayCanvasRef.current.height;
                setMask(new Uint8Array(length).fill(1));
              }}
              className="w-full py-5 border border-white/20 text-[10px] uppercase tracking-[0.3em] hover:bg-white hover:text-black transition-all cursor-pointer font-bold active:scale-[0.98]"
            >
              Commit All Pixels
            </button>
            <button 
              onClick={smartDetect}
              className="w-full py-5 bg-[#FF4D00] text-white text-[10px] uppercase tracking-[0.3em] hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer font-bold shadow-[0_10px_30px_rgba(255,77,0,0.2)]"
            >
              Instant Mosaic
            </button>
          </div>
        </aside>
      </main>

      {/* Bottom Status Bar */}
      <footer className="px-8 py-5 border-t border-white/10 flex justify-between items-center text-[9px] font-mono opacity-30 uppercase tracking-[0.4em] shrink-0 pointer-events-none">
        <div className="flex gap-10">
          <span>{displayCanvasRef.current?.width || 0} x {displayCanvasRef.current?.height || 0} PX</span>
          <span>Sampling: 4:4:4</span>
        </div>
        <div className="hidden lg:flex gap-10">
          <span>Engine: Voxel_Render_v2</span>
          <span>Bit_Depth: 32_Float</span>
        </div>
      </footer>
    </div>
  );
}
