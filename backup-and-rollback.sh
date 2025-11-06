#!/bin/bash

# 备份和回滚脚本

echo "🔧 皇冠赛事抓取服务 - 备份和回滚工具"
echo ""

# 显示菜单
echo "请选择操作："
echo "1) 创建新分支并提交修改（推荐）"
echo "2) 暂存修改（临时保存）"
echo "3) 手动备份 fetcher 目录"
echo "4) 回滚到修改前的状态"
echo "5) 查看当前状态"
echo "0) 退出"
echo ""

read -p "请输入选项 [0-5]: " choice

case $choice in
  1)
    echo ""
    echo "📝 创建新分支并提交修改..."
    
    # 创建并切换到新分支
    git checkout -b feature/crown-multi-type-fetch
    
    # 添加所有修改
    git add .
    
    # 提交
    git commit -m "实现皇冠API多类型赛事抓取（滚球、今日、早盘）

- 支持滚球（live）、今日（today）、早盘（early）三种类型
- 每次抓取循环依次获取三种类型，合并后保存
- 为每场比赛添加 showtype 标记
- 分类统计各类型赛事数量
- 添加完整的文档和脚本"
    
    echo ""
    echo "✅ 已创建新分支 feature/crown-multi-type-fetch 并提交修改"
    echo ""
    echo "📌 如何使用："
    echo "  - 回到原版本: git checkout main"
    echo "  - 使用新版本: git checkout feature/crown-multi-type-fetch"
    echo "  - 查看所有分支: git branch"
    ;;
    
  2)
    echo ""
    echo "💾 暂存修改..."
    
    git stash save "皇冠API多类型赛事抓取修改 - $(date '+%Y-%m-%d %H:%M:%S')"
    
    echo ""
    echo "✅ 修改已暂存，代码已回到修改前的状态"
    echo ""
    echo "📌 如何使用："
    echo "  - 恢复修改: git stash pop"
    echo "  - 查看暂存列表: git stash list"
    echo "  - 删除暂存: git stash drop"
    ;;
    
  3)
    echo ""
    echo "📦 手动备份 fetcher 目录..."
    
    backup_name="fetcher-backup-$(date +%Y%m%d-%H%M%S)"
    cp -r fetcher "$backup_name"
    
    echo ""
    echo "✅ 已备份到: $backup_name"
    echo ""
    echo "📌 如何恢复："
    echo "  rm -rf fetcher"
    echo "  mv $backup_name fetcher"
    ;;
    
  4)
    echo ""
    echo "⚠️  警告：这将丢弃所有未提交的修改！"
    read -p "确定要回滚吗？(yes/no): " confirm
    
    if [ "$confirm" = "yes" ]; then
      echo ""
      echo "🔄 回滚到修改前的状态..."
      
      # 丢弃所有修改
      git checkout -- fetcher/.env.example
      git checkout -- fetcher/README.md
      git checkout -- fetcher/src/crown-client.ts
      git checkout -- fetcher/src/index.ts
      
      # 删除新增的文件
      rm -f CROWN_FETCHER_IMPLEMENTATION.md
      rm -f fetcher/CHANGELOG.md
      rm -f fetcher/DEPLOY.md
      rm -f fetcher/QUICK_START.md
      rm -f fetcher/start.sh
      rm -f fetcher/stop.sh
      rm -f fetcher/使用说明.md
      
      echo ""
      echo "✅ 已回滚到修改前的状态"
    else
      echo ""
      echo "❌ 已取消回滚"
    fi
    ;;
    
  5)
    echo ""
    echo "📊 当前状态："
    echo ""
    git status
    echo ""
    echo "📌 当前分支："
    git branch
    echo ""
    echo "📌 最近的提交："
    git log --oneline -5
    ;;
    
  0)
    echo ""
    echo "👋 退出"
    exit 0
    ;;
    
  *)
    echo ""
    echo "❌ 无效的选项"
    exit 1
    ;;
esac

echo ""

