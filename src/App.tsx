/**
 * 应用主组件
 * 负责整体布局和视图切换
 */
import { useEffect } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { PitchView } from '@/components/views/PitchView';
import { PitchTrackingView } from '@/components/views/PitchTrackingView';
import { SpectrumView } from '@/components/views/SpectrumView';
import { AnalysisView } from '@/components/views/AnalysisView';
import { SettingsView } from '@/components/views/SettingsView';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';
import './App.css';

/**
 * 应用主函数组件
 * @returns React.ReactNode - 应用的整体布局
 */
function App() {
  // 从全局状态中按字段订阅，减少无关重渲染
  const currentView = useStore((state) => state.currentView);
  const theme = useStore((state) => state.settings.theme);

  /**
   * 应用主题效果
   * 根据用户设置的主题模式更新根元素的class
   */
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') {
      // 当主题设置为系统时，根据系统偏好设置
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.toggle('dark', prefersDark);
    } else {
      // 当主题设置为手动选择时，直接应用
      root.classList.toggle('dark', theme === 'dark');
    }
  }, [theme]);

  /**
   * 监听系统主题变化
   * 当主题设置为系统时，监听系统主题变化并更新
   */
  useEffect(() => {
    // 如果主题不是系统模式，则不需要监听
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    /**
     * 处理系统主题变化的回调函数
     * @param e MediaQueryListEvent - 媒体查询事件
     */
    const handleChange = (e: MediaQueryListEvent) => {
      document.documentElement.classList.toggle('dark', e.matches);
    };

    // 添加事件监听器
    mediaQuery.addEventListener('change', handleChange);
    // 清理事件监听器
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  /**
   * 根据当前视图状态渲染对应组件
   * @returns React.ReactNode - 对应视图的组件
   */
  const renderView = () => {
    switch (currentView) {
      case 'pitch':
        return <PitchView />;
      case 'pitch-tracking':
        return <PitchTrackingView />;
      case 'spectrum':
        return <SpectrumView />;
      case 'analysis':
        return <AnalysisView />;
      case 'settings':
        return <SettingsView />;
      default:
        // 默认返回PitchView
        return <PitchView />;
    }
  };

  return (
    <div className={cn(
      'min-h-screen bg-background text-foreground',
      'transition-colors duration-300'
    )}>
      {/* 顶部导航栏 */}
      <TopBar />

      {/* 主内容区域 */}
      <main className={cn(
        'min-h-screen pt-24', // 为固定的顶部导航栏添加 padding
        'transition-all duration-300'
      )}>
        <div className="p-4 md:p-6 h-[calc(100vh-6rem)]">
          <div className="h-full glass-card p-4 md:p-6 overflow-auto">
            {/* 渲染当前视图 */}
            {renderView()}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
