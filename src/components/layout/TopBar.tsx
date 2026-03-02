/**
 * 顶部导航栏组件
 * 包含应用标题、导航菜单和音高检测控制按钮
 */
import { useEffect, useRef, useState } from 'react';
import { BarChart3, Settings, Waves, Mic, MicOff, Menu, X } from 'lucide-react';
import { useStore } from '@/store/useStore';
import type { NavItem } from '@/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import gsap from 'gsap';

/**
 * 导航菜单项配置
 */
const navItems: NavItem[] = [
  { id: 'pitch-tracking', label: '实时音高跟踪', icon: Waves },
  { id: 'spectrum', label: '频谱图', icon: Waves },
  { id: 'analysis', label: '结果分析', icon: BarChart3 },
  { id: 'settings', label: '设置', icon: Settings },
];

/**
 * 顶部导航栏组件
 * @returns React.ReactNode - 顶部导航栏
 */
export function TopBar() {
  // 从全局状态按字段订阅，减少无关重渲染
  const currentView = useStore((state) => state.currentView);
  const setCurrentView = useStore((state) => state.setCurrentView);
  const isDetecting = useStore((state) => state.isDetecting);
  const startDetection = useStore((state) => state.startDetection);
  const stopDetection = useStore((state) => state.stopDetection);
  // 移动端菜单状态
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  // 菜单引用
  const menuRef = useRef<HTMLDivElement>(null);
  // 导航按钮引用数组
  const navRefs = useRef<(HTMLButtonElement | null)[]>([]);

  /**
   * 切换音高检测状态
   * 开始或停止音高检测
   */
  const toggleDetection = async () => {
    if (isDetecting) {
      // 停止检测
      stopDetection();
    } else {
      try {
        // 开始检测
        await startDetection();
      } catch (err) {
        // 处理错误
        console.error('无法访问麦克风，请检查权限设置:', err);
      }
    }
  };

  /**
   * 切换移动端菜单
   * 打开或关闭移动端导航菜单
   */
  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  /**
   * 点击外部关闭移动端菜单
   * 当菜单打开时，监听点击事件，点击外部时关闭菜单
   */
  useEffect(() => {
    /**
     * 处理点击外部事件
     * @param event MouseEvent - 鼠标点击事件
     */
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMobileMenuOpen(false);
      }
    };

    // 当菜单打开时添加事件监听器
    if (isMobileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    // 清理事件监听器
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMobileMenuOpen]);

  /**
   * 移动端菜单入场动画
   * 当菜单打开时，使用GSAP添加动画效果
   */
  useEffect(() => {
    const ctx = gsap.context(() => {
      if (isMobileMenuOpen && menuRef.current) {
        // 菜单容器动画
        gsap.fromTo(
          menuRef.current,
          { opacity: 0, y: -20 },
          { opacity: 1, y: 0, duration: 0.3, ease: 'expo.out' }
        );

        // 导航项动画
        navRefs.current.forEach((ref, i) => {
          if (ref) {
            gsap.fromTo(
              ref,
              { opacity: 0, y: -10 },
              { opacity: 1, y: 0, duration: 0.2, delay: 0.1 + i * 0.05, ease: 'expo.out' }
            );
          }
        });
      }
    });

    // 清理GSAP上下文
    return () => ctx.revert();
  }, [isMobileMenuOpen]);

  return (
    <>
      {/* 顶部导航栏 */}
      <header className={cn(
        'fixed top-0 left-0 right-0 z-50',
        'glass border-b border-border/50',
        'flex items-center justify-between px-4 py-3 md:px-6 md:py-3'
      )}>
        {/* Logo区域 */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <div className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center',
              'bg-primary text-primary-foreground',
              'transition-all duration-300'
            )}>
              <Mic className="w-4 h-4" />
            </div>
            {/* 检测状态指示器 */}
            {isDetecting && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            )}
          </div>
          <div>
            <h1 className="font-semibold text-base tracking-tight">Simple Voice Tools</h1>
          </div>
        </div>

        {/* 桌面端导航 */}
        <div className="hidden md:flex items-center gap-1">
          <nav className="flex items-center gap-1">
            {navItems.map((item, index) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;

              return (
                <button
                  key={item.id}
                  ref={(el) => { navRefs.current[index] = el; }}
                  onClick={() => setCurrentView(item.id)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-lg',
                    'text-sm font-medium transition-all duration-300',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/10'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
          
          {/* 录音控制按钮 */}
          <Button
            onClick={toggleDetection}
            size="sm"
            className={cn(
              'ml-3 gap-1',
              isDetecting ? 'bg-red-500 hover:bg-red-600' : 'bg-primary hover:bg-primary/90'
            )}
          >
            {isDetecting ? (
              <>
                <MicOff className="w-4 h-4" />
                停止
              </>
            ) : (
              <>
                <Mic className="w-4 h-4" />
                开始
              </>
            )}
          </Button>
        </div>

        {/* 移动端控制 */}
        <div className="flex items-center gap-1 md:hidden">
          {/* 录音控制按钮 */}
          <Button
            onClick={toggleDetection}
            size="sm"
            className={cn(
              'gap-1 px-2',
              isDetecting ? 'bg-red-500 hover:bg-red-600' : 'bg-primary hover:bg-primary/90'
            )}
          >
            {isDetecting ? (
              <MicOff className="w-4 h-4" />
            ) : (
              <Mic className="w-4 h-4" />
            )}
          </Button>
          
          {/* 移动端菜单按钮 */}
          <button
            onClick={toggleMobileMenu}
            className={cn(
              'w-8 h-8 aspect-square rounded-full',
              'bg-primary text-primary-foreground shadow-sm shadow-primary/10',
              'flex items-center justify-center',
              'transition-all duration-300'
            )}
            aria-label={isMobileMenuOpen ? '关闭菜单' : '打开菜单'}
          >
            {isMobileMenuOpen ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>
      </header>

      {/* 移动端菜单 */}
      {isMobileMenuOpen && (
        <div
          ref={menuRef}
          className={cn(
            'fixed top-14 left-0 right-0 z-40',
            'glass border-b border-border/50',
            'md:hidden'
          )}
        >
          <nav className="px-3 py-2 space-y-1">
            {navItems.map((item, index) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;

              return (
                <button
                  key={item.id}
                  ref={(el) => { navRefs.current[index] = el; }}
                  onClick={() => {
                    setCurrentView(item.id);
                    setIsMobileMenuOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 rounded-lg',
                    'text-sm font-medium transition-all duration-300',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/10'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                  {isActive && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-current opacity-60" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      )}

      {/* 状态指示器 - 仅移动端 */}
      <div className="fixed bottom-4 left-4 z-40 md:hidden">
        <div className={cn(
          'flex items-center gap-1 px-3 py-1.5 rounded-full',
          'glass border border-border/50'
        )}>
          <div className={cn(
            'w-2 h-2 rounded-full transition-colors duration-300',
            isDetecting ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground/30'
          )} />
          <span className="text-xs text-muted-foreground">
            {isDetecting ? '检测中' : '待机'}
          </span>
        </div>
      </div>
    </>
  );
}
