/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, 
  Sparkles, 
  History, 
  Trash2, 
  Copy, 
  Check, 
  Share2, 
  Moon, 
  Sun, 
  Plus,
  MessageSquare,
  ArrowRight,
  Info,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- Utility ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  type?: 'initial' | 'clarification' | 'enhancement';
  enhancedData?: {
    prompt: string;
    explanation: string;
  };
  questions?: string[];
  timestamp: number;
}

interface HistoryItem {
  id: string;
  title: string;
  messages: Message[];
  timestamp: number;
}

// --- Constants ---
const STORAGE_KEY = 'prompt_enhancer_history';
const THEME_KEY = 'prompt_enhancer_theme';
const HISTORY_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

const SYSTEM_INSTRUCTION = `You are an expert Prompt Engineer. Your goal is to help users enhance their prompts for LLMs like ChatGPT, Claude, or Gemini.

PROCESS:
1. Analyze the user's initial prompt or their answers to your questions.
2. If the prompt is vague, lacks context, or could be significantly improved by knowing more about the goal, audience, tone, or constraints, ask 2-3 specific clarifying questions.
3. If the prompt is already clear, or once the user provides clarification, generate a high-quality enhanced prompt.
4. The enhanced prompt MUST use advanced techniques:
   - Role Prompting (e.g., "You are an expert...")
   - Clear, structured instructions
   - Context and Background
   - Output Format Specification
   - Step-by-step reasoning (Chain of Thought)
5. Provide a brief, bulleted explanation of the improvements made.

OUTPUT FORMAT:
You MUST respond in valid JSON format.
If asking questions:
{
  "type": "clarification",
  "questions": ["Question 1", "Question 2", "Question 3"]
}

If providing an enhanced prompt:
{
  "type": "enhancement",
  "enhancedPrompt": "The full, optimized prompt goes here...",
  "explanation": "Brief explanation of improvements..."
}

Keep your tone professional, helpful, and concise.`;

// --- Components ---

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize Theme and History
  useEffect(() => {
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    }

    const savedHistory = localStorage.getItem(STORAGE_KEY);
    if (savedHistory) {
      try {
        const parsedHistory: HistoryItem[] = JSON.parse(savedHistory);
        // Filter out items older than 24 hours
        const now = Date.now();
        const validHistory = parsedHistory.filter(item => now - item.timestamp < HISTORY_EXPIRY_MS);
        setHistory(validHistory);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(validHistory));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }

    // Check for shared prompt in URL
    const params = new URLSearchParams(window.location.search);
    const sharedPrompt = params.get('p');
    if (sharedPrompt) {
      const decoded = decodeURIComponent(sharedPrompt);
      setInput(decoded);
      // Clear URL param after reading
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const toggleTheme = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    if (newMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem(THEME_KEY, 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem(THEME_KEY, 'light');
    }
  };

  const saveToHistory = (newMessages: Message[]) => {
    if (newMessages.length === 0) return;
    
    const firstUserMsg = newMessages.find(m => m.role === 'user')?.content || 'New Enhancement';
    const title = firstUserMsg.slice(0, 30) + (firstUserMsg.length > 30 ? '...' : '');
    
    const newItem: HistoryItem = {
      id: Date.now().toString(),
      title,
      messages: newMessages,
      timestamp: Date.now()
    };

    const updatedHistory = [newItem, ...history].slice(0, 20); // Keep last 20
    setHistory(updatedHistory);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedHistory));
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: Date.now()
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      const model = "gemini-3.1-pro-preview";
      
      // Construct conversation history for context
      const chatHistory = newMessages.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      }));

      const response = await ai.models.generateContent({
        model,
        contents: chatHistory,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          temperature: 0.7,
        }
      });

      const result = JSON.parse(response.text || '{}');
      
      let assistantMessage: Message;

      if (result.type === 'clarification') {
        assistantMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: "I've analyzed your prompt. To make it truly powerful, could you clarify a few things?",
          type: 'clarification',
          questions: result.questions,
          timestamp: Date.now()
        };
      } else {
        assistantMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: "Here is your enhanced prompt!",
          type: 'enhancement',
          enhancedData: {
            prompt: result.enhancedPrompt,
            explanation: result.explanation
          },
          timestamp: Date.now()
        };
        // If it's an enhancement, save the whole conversation to history
        saveToHistory([...newMessages, assistantMessage]);
      }

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error("AI Error:", error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: "Sorry, I encountered an error while processing your request. Please try again.",
        timestamp: Date.now()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const sharePrompt = () => {
    if (messages.length === 0) return;
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content;
    if (!lastUserMsg) return;
    
    const url = new URL(window.location.href);
    url.searchParams.set('p', encodeURIComponent(lastUserMsg));
    copyToClipboard(url.toString(), 'share');
  };

  const clearConversation = () => {
    setMessages([]);
    setInput('');
  };

  const loadHistoryItem = (item: HistoryItem) => {
    setMessages(item.messages);
    setShowHistory(false);
  };

  const deleteHistoryItem = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const updated = history.filter(h => h.id !== id);
    setHistory(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  return (
    <div className={cn(
      "min-h-screen flex flex-col transition-colors duration-300",
      isDarkMode ? "bg-[#0a0a0a] text-white" : "bg-[#f8f9fa] text-gray-900"
    )}>
      {/* Header */}
      <header className={cn(
        "sticky top-0 z-30 border-b px-4 py-3 flex items-center justify-between backdrop-blur-md",
        isDarkMode ? "bg-black/50 border-white/10" : "bg-white/50 border-black/5"
      )}>
        <div className="flex items-center gap-2">
          <div className="bg-indigo-600 p-1.5 rounded-lg">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <h1 className="font-bold text-lg tracking-tight">Prompt Enhancer</h1>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowHistory(!showHistory)}
            className={cn(
              "p-2 rounded-full transition-colors",
              isDarkMode ? "hover:bg-white/10" : "hover:bg-black/5"
            )}
            title="History"
          >
            <History className="w-5 h-5" />
          </button>
          <button 
            onClick={toggleTheme}
            className={cn(
              "p-2 rounded-full transition-colors",
              isDarkMode ? "hover:bg-white/10" : "hover:bg-black/5"
            )}
          >
            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden relative">
        {/* Sidebar History */}
        <AnimatePresence>
          {showHistory && (
            <motion.aside
              initial={{ x: -300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -300, opacity: 0 }}
              className={cn(
                "absolute left-0 top-0 bottom-0 w-72 z-40 border-r shadow-2xl flex flex-col",
                isDarkMode ? "bg-[#111] border-white/10" : "bg-white border-black/5"
              )}
            >
              <div className="p-4 border-b flex items-center justify-between">
                <h2 className="font-semibold flex items-center gap-2">
                  <History className="w-4 h-4" /> History
                </h2>
                <button onClick={() => setShowHistory(false)} className="p-1 hover:bg-black/5 rounded">
                  <Plus className="w-4 h-4 rotate-45" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {history.length === 0 ? (
                  <div className="p-4 text-center text-sm opacity-50 italic">
                    No history yet. Enhancements are stored for 24 hours.
                  </div>
                ) : (
                  history.map(item => (
                    <div 
                      key={item.id}
                      onClick={() => loadHistoryItem(item)}
                      className={cn(
                        "group p-3 rounded-xl cursor-pointer text-sm flex items-center justify-between transition-all",
                        isDarkMode ? "hover:bg-white/5" : "hover:bg-black/5"
                      )}
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <MessageSquare className="w-4 h-4 flex-shrink-0 opacity-50" />
                        <span className="truncate">{item.title}</span>
                      </div>
                      <button 
                        onClick={(e) => deleteHistoryItem(e, item.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 transition-opacity"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
              <div className="p-4 border-t text-[10px] opacity-40 text-center uppercase tracking-widest">
                Auto-clears after 24h
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col h-full max-w-4xl mx-auto w-full px-4">
          <div className="flex-1 overflow-y-auto py-8 space-y-8 scrollbar-hide">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-6 max-w-md mx-auto">
                <div className="w-16 h-16 bg-indigo-600/10 rounded-2xl flex items-center justify-center">
                  <Sparkles className="w-8 h-8 text-indigo-600" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold mb-2">Enhance Your Prompts</h2>
                  <p className="text-sm opacity-60">
                    Paste your basic prompt below. I'll analyze it, ask clarifying questions if needed, and provide a professional, optimized version.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3 w-full">
                  {[
                    "Write a blog post about coffee",
                    "Create a workout plan for beginners",
                    "Help me write a professional email"
                  ].map(example => (
                    <button 
                      key={example}
                      onClick={() => setInput(example)}
                      className={cn(
                        "text-left p-3 rounded-xl text-sm border transition-all hover:scale-[1.02]",
                        isDarkMode ? "bg-white/5 border-white/10 hover:bg-white/10" : "bg-white border-black/5 hover:border-black/20"
                      )}
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={msg.id} 
                  className={cn(
                    "flex flex-col",
                    msg.role === 'user' ? "items-end" : "items-start"
                  )}
                >
                  <div className={cn(
                    "max-w-[85%] rounded-2xl p-4 shadow-sm",
                    msg.role === 'user' 
                      ? "bg-indigo-600 text-white rounded-tr-none" 
                      : cn(isDarkMode ? "bg-[#1a1a1a] border border-white/5" : "bg-white border border-black/5", "rounded-tl-none")
                  )}>
                    {msg.role === 'assistant' && (
                      <div className="flex items-center gap-2 mb-2 opacity-50 text-[10px] font-bold uppercase tracking-wider">
                        <Sparkles className="w-3 h-3" /> Assistant
                      </div>
                    )}
                    
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>

                    {/* Clarification Questions */}
                    {msg.type === 'clarification' && msg.questions && (
                      <div className="mt-4 space-y-2">
                        {msg.questions.map((q, i) => (
                          <div key={i} className={cn(
                            "p-3 rounded-lg flex items-start gap-3 text-sm",
                            isDarkMode ? "bg-white/5" : "bg-black/5"
                          )}>
                            <div className="bg-indigo-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] flex-shrink-0 mt-0.5">
                              {i + 1}
                            </div>
                            <span>{q}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Enhancement Result */}
                    {msg.type === 'enhancement' && msg.enhancedData && (
                      <div className="mt-6 space-y-4">
                        <div className={cn(
                          "rounded-xl overflow-hidden border",
                          isDarkMode ? "bg-black border-white/10" : "bg-gray-50 border-black/5"
                        )}>
                          <div className="px-4 py-2 border-b flex items-center justify-between bg-black/5">
                            <span className="text-[10px] font-bold uppercase tracking-widest opacity-50">Optimized Prompt</span>
                            <button 
                              onClick={() => copyToClipboard(msg.enhancedData!.prompt, msg.id)}
                              className="p-1.5 hover:bg-black/10 rounded-md transition-colors"
                            >
                              {copiedId === msg.id ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                            </button>
                          </div>
                          <div className="p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap select-all">
                            {msg.enhancedData.prompt}
                          </div>
                        </div>

                        <div className="p-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5">
                          <h4 className="text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-2 text-indigo-500">
                            <Info className="w-3 h-3" /> Why this is better
                          </h4>
                          <div className="text-sm opacity-80 leading-relaxed">
                            <ReactMarkdown>{msg.enhancedData.explanation}</ReactMarkdown>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))
            )}
            {isLoading && (
              <div className="flex items-center gap-3 text-sm opacity-50 animate-pulse">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>AI is thinking...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Bar */}
          <div className="pb-8 pt-4">
            <form 
              onSubmit={handleSend}
              className={cn(
                "relative rounded-2xl border shadow-lg transition-all focus-within:ring-2 focus-within:ring-indigo-500/50",
                isDarkMode ? "bg-[#1a1a1a] border-white/10" : "bg-white border-black/10"
              )}
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Paste your prompt here..."
                className="w-full bg-transparent p-4 pr-24 resize-none min-h-[60px] max-h-[200px] focus:outline-none text-sm"
                rows={1}
              />
              <div className="absolute right-2 bottom-2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={clearConversation}
                  className={cn(
                    "p-2 rounded-xl transition-colors",
                    isDarkMode ? "hover:bg-white/10" : "hover:bg-black/5"
                  )}
                  title="Clear"
                >
                  <Trash2 className="w-4 h-4 opacity-50" />
                </button>
                <button
                  type="button"
                  onClick={sharePrompt}
                  className={cn(
                    "p-2 rounded-xl transition-colors",
                    isDarkMode ? "hover:bg-white/10" : "hover:bg-black/5"
                  )}
                  title="Share"
                >
                  {copiedId === 'share' ? <Check className="w-4 h-4 text-green-500" /> : <Share2 className="w-4 h-4 opacity-50" />}
                </button>
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className={cn(
                    "p-2 rounded-xl bg-indigo-600 text-white transition-all hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed",
                    isLoading && "animate-pulse"
                  )}
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </form>
            <p className="text-[10px] text-center mt-3 opacity-40 uppercase tracking-widest">
              Powered by Gemini 3.1 Pro • Advanced Prompt Engineering
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
