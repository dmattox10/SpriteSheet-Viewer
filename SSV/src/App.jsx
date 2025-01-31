import React, { useState, useEffect } from 'react';
import { Upload, Moon, Sun } from 'lucide-react';
import './App.scss';

const Alert = ({ children }) => (
  <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-6">
    {children}
  </div>
);

const App = () => {
  const [jsonData, setJsonData] = useState(null);
  const [jsonFormat, setJsonFormat] = useState(null); // 'phaser' or 'finalparsec'
  const [originalFilename, setOriginalFilename] = useState(null);
  const [isComplete, setIsComplete] = useState(false);

  const [spriteImage, setSpriteImage] = useState(null);
  const [error, setError] = useState(null);

  const [isDarkMode, setIsDarkMode] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      return savedTheme === 'dark';
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const [hoveredFrame, setHoveredFrame] = useState(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e) => {
      if (!localStorage.getItem('theme')) {
        setIsDarkMode(e.matches);
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    document.body.className = isDarkMode ? 'dark-mode' : 'light-mode';
    document.body.style.transition = 'background-color 0.3s ease, color 0.3s ease';
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    
    const style = document.createElement('style');
    style.textContent = `
      * {
        transition: background-color 0.3s ease,
                    color 0.3s ease,
                    border-color 0.3s ease,
                    transform 0.2s ease;
      }
    `;
    document.head.appendChild(style);
    
    return () => document.head.removeChild(style);
  }, [isDarkMode]);

  // Add format detection to handleJsonUpload
  const handleJsonUpload = async (event) => {
    if (isComplete) {
      setSpriteImage(null);
      setHoveredFrame(null);
    }
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.name.endsWith('.json')) {
      setError('Please upload a JSON file');
      return;
    }
    setOriginalFilename(file.name.replace('.json', ''));

    try {
      const text = await file.text();
      let parsedData = JSON.parse(text); // Change const to let
      
      // Detect format
      if (parsedData.frames && parsedData.meta) {
        setJsonFormat('phaser');
        setJsonData(parsedData);
      } else if (parsedData.sprites && parsedData.spriteSheetWidth) {
        setJsonFormat('finalparsec');
        // Convert to Phaser format
        const convertedData = convertFinalParsecToPhaser(parsedData); // Create new variable
        setJsonData(convertedData);
      } else {
        setError('Unrecognized JSON format');
        return;
      }
      
      setError(null);
    } catch (err) {
      setError('Error reading JSON file');
    }
  };

const convertFinalParsecToPhaser = (fpData) => {
  const frames = {};
  
  fpData.sprites.forEach(sprite => {
    frames[sprite.fileName] = {
      frame: {
        x: sprite.x,
        y: sprite.y,
        w: sprite.width,
        h: sprite.height
      }
    };
  });
  // Toggle theme handler
  
  return {
    frames,
    meta: {
      format: "RGBA8888",
      size: {
        w: fpData.spriteSheetWidth,
        h: fpData.spriteSheetHeight
      },
      scale: "1"
    }
  };
};

const handleThemeToggle = () => {
  setIsDarkMode(prev => !prev);
};

  const handleImageUpload = async (event) => {
    if (isComplete) {
      setJsonData(null);
      setJsonFormat(null);
      setOriginalFilename(null);
      setHoveredFrame(null);
    }
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file');
      return;
    }

    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      
      img.onload = () => {
        if (jsonData && (img.width !== jsonData.meta.size.w || img.height !== jsonData.meta.size.h)) {
          setError('Image dimensions do not match JSON specification');
          URL.revokeObjectURL(url);
          return;
        }
        setSpriteImage(url);
        setError(null);
      };
      
      img.onerror = () => {
        setError('Error loading image');
        URL.revokeObjectURL(url);
      };
      
      img.src = url;
    } catch (err) {
      setError('Error reading image file');
    }
  };

  // Add useEffect to handle completion state
useEffect(() => {
  if (jsonData && spriteImage) {
    setIsComplete(true);
  } else {
    setIsComplete(false);
  }
}, [jsonData, spriteImage]);

 const handleExport = () => {
  if (!jsonData) return;
  
  const phaserData = {
    frames: {},
    meta: {
      format: "RGBA8888",
      size: { 
        w: jsonData.meta.size.w,
        h: jsonData.meta.size.h 
      },
      scale: "1"
    }
  };

  // Access the frames from the already-converted Phaser format data
  Object.entries(jsonData.frames).forEach(([fileName, data]) => {
    phaserData.frames[fileName] = {
      frame: {
        x: data.frame.x,
        y: data.frame.y,
        w: data.frame.w,
        h: data.frame.h
      }
    };
  });

  const blob = new Blob([JSON.stringify(phaserData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = originalFilename ? `${originalFilename}_phaser.json` : 'spritesheet_phaser.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
  return (
    <div className="container">
      <nav className="navbar">
        <h1>Sprite Sheet Viewer</h1>
        <button 
          onClick={handleThemeToggle}
          className="theme-toggle"
          aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
        >
          {isDarkMode ? <Sun className="h-6 w-6" /> : <Moon className="h-6 w-6" />}
        </button>
      </nav>

      <div className="csv-input-container">
        <div className="csv-input">
          <input
            type="file"
            accept=".json"
            onChange={handleJsonUpload}
            className="hidden"
            id="json-upload"
          />
          <label
            htmlFor="json-upload"
            className="button-container"
            title={jsonData ? "Choose another JSON file" : "Upload JSON file"}

          >
            <div className="flex flex-col items-center cursor-pointer">
              <Upload className="h-12 w-12 mb-2" />
              <span>Upload JSON file</span>
            </div>
          </label>
          {jsonData && (
            <div className="mt-2 text-sm">JSON loaded successfully!</div>
          )}
        </div>

        <div className="csv-input">
          <input
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
            id="image-upload"
          />
          <label
            htmlFor="image-upload"
            className="button-container"
            title={spriteImage ? "Choose another image" : "Upload sprite sheet image"}

          >
            <div className="flex flex-col items-center cursor-pointer">
              <Upload className="h-12 w-12 mb-2" />
              <span>Upload sprite sheet image</span>
            </div>
          </label>
          {spriteImage && (
            <div className="mt-2 text-sm">Image loaded successfully!</div>
          )}
        </div>
      </div>

      {error && (
        <Alert>
          <p>{error}</p>
        </Alert>
      )}

      {jsonData && spriteImage && (
        <div className="visualization-container">
          <div className="table-component">
            <div 
              className="relative"
              style={{ 
                width: jsonData.meta.size.w,
                height: jsonData.meta.size.h
              }}
            >
              <img
                src={spriteImage}
                alt="Sprite Sheet"
                className="absolute top-0 left-0"
                style={{
                  width: jsonData.meta.size.w,
                  height: jsonData.meta.size.h
                }}
              />
              {Object.entries(jsonData.frames).map(([filename, data]) => (
               <div
               key={filename}
               className={`absolute frame-container ${
                 hoveredFrame === filename ? 'frame-hovered' : ''
               }`}
               style={{
                 left: data.frame.x,
                 top: data.frame.y,
                 width: data.frame.w,
                 height: data.frame.h,
               }}
               onMouseEnter={() => setHoveredFrame(filename)}
               onMouseLeave={() => setHoveredFrame(null)}
               title={`${filename} (${data.frame.w}x${data.frame.h})`} // Add this line
             >
               <div className="frame-label">
                 {`${filename} (${data.frame.w}x${data.frame.h})`}
               </div>
               <div className="frame-overlay" />
             </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {(!jsonData || !spriteImage) && (
        <div className="instructions-content">
          <p className="text-sm mt-2">Upload both a sprite sheet JSON file and the corresponding PNG image to view the frames.</p>
          <p className="text-sm mt-2">The JSON file should contain frame data and the image dimensions should match the specification.</p>
        </div>
      )}

{jsonData && spriteImage && jsonFormat === "finalparsec" && (
  <div className="button-container">
    <button 
      onClick={handleExport}
      className="export-button"
    >
      Export as Phaser JSON
    </button>
  </div>
)}

<footer className="footer">
  <p>Sprite Sheet Viewer makes it easy to inspect and convert sprite atlases. When working with sprite sheets, it can be difficult to identify which sprite is which within the atlas. This tool helps by visualizing frame data and runs entirely in your browser - your images are never uploaded anywhere.</p>
  <p>Supports both JSON Hash format (from <a href="https://www.codeandweb.com/texturepacker" target="_blank" rel="noopener noreferrer">TexturePacker</a> and similar tools) and sprite sheets created with <a href="https://www.finalparsec.com/tools/sprite_sheet_maker" target="_blank" rel="noopener noreferrer">Final Parsec's free tool</a>. The JSON Hash format is used by many game engines including <a href="https://phaser.io/" target="_blank" rel="noopener noreferrer">Phaser</a>.</p>
  <p>Created by <a href="https://dantheman.fyi" target="_blank" rel="noopener noreferrer">Daniel Mattox</a>. View source on <a href="https://github.com/dmattox10/SpriteSheet-Viewer" target="_blank" rel="noopener noreferrer">GitHub</a>.</p>
  <p>&copy; {new Date().getFullYear()} <a href="https://dantheman.fyi" target="_blank" rel="noopener noreferrer">Daniel Mattox</a>. All rights reserved.</p>
</footer>

    </div>
  );
};

export default App;