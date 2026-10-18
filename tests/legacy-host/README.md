这些场景来自 qiye@018b3b1，针对原先同页面 DOM，不再作为新架构的可执行入口。迁移后的跨仓库端到端测试见主仓库 tests/plugin-e2e.py；组件运行包回归见 tests/runtime-e2e.py。逻辑测试保留原断言并使用固定的旧宿主数据夹具。
