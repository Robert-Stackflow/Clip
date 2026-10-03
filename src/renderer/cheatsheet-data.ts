// Original, compact examples checked against the linked primary documentation.
export type CheatRow=[syntax:string,description:string];
export type CheatSection={name:string;rows:CheatRow[]};
export type CheatTopic={id:string;label:string;description:string;source:string;sections:CheatSection[]};

export const cheatTopics:CheatTopic[]=[
 {id:'git',label:'Git',description:'仓库、分支、提交与协作',source:'https://git-scm.com/docs',sections:[
  {name:'开始与查看',rows:[['git init','初始化仓库'],['git clone <url>','克隆远程仓库'],['git status -sb','简要查看状态与分支'],['git log --oneline --graph --decorate -20','查看最近提交图'],['git diff','查看未暂存修改'],['git diff --staged','查看已暂存修改'],['git show <commit>','查看提交详情']]},
  {name:'暂存与提交',rows:[['git add <path>','暂存文件'],['git add -p','逐块选择要暂存的修改'],['git commit -m "message"','提交已暂存修改'],['git restore <path>','丢弃工作区中指定文件的修改'],['git restore --staged <path>','取消暂存'],['git stash push -u -m "note"','暂存修改及未跟踪文件'],['git stash pop','恢复最近一次暂存']]},
  {name:'分支与远程',rows:[['git branch -av','查看本地和远程分支'],['git switch -c <branch>','新建并切换分支'],['git switch <branch>','切换分支'],['git merge <branch>','合并分支'],['git rebase <branch>','将当前分支变基到指定分支'],['git remote -v','查看远程地址'],['git fetch --all --prune','更新远程引用并清理过期引用'],['git pull --ff-only','仅在可快进时拉取'],['git push -u origin <branch>','推送并建立上游关联']]},
  {name:'排查',rows:[['git blame <file>','逐行查看修改来源'],['git bisect start','开始二分定位回归'],['git reflog','查看本地引用移动记录'],['git cherry-pick <commit>','应用指定提交']]}
 ]},
 {id:'latex',label:'LaTeX',description:'文档结构、排版与数学公式',source:'https://www.latex-project.org/help/documentation/',sections:[
  {name:'文档结构',rows:[['\\documentclass{article}','选择文档类'],['\\usepackage{amsmath}','载入宏包'],['\\begin{document} … \\end{document}','正文范围'],['\\section{标题}','一级标题'],['\\subsection{标题}','二级标题'],['\\label{key} / \\ref{key}','标记与交叉引用'],['\\tableofcontents','生成目录']]},
  {name:'文字与布局',rows:[['\\textbf{文字}','粗体'],['\\emph{文字}','强调文字'],['\\texttt{code}','等宽文字'],['\\href{url}{文字}','链接（需 hyperref）'],['\\includegraphics[width=.6\\linewidth]{file}','插入图片（需 graphicx）'],['\\begin{itemize} … \\item … \\end{itemize}','项目列表'],['\\begin{enumerate} … \\item … \\end{enumerate}','编号列表']]},
  {name:'数学',rows:[['$a^2+b^2=c^2$','行内公式'],['\\[ E=mc^2 \\]','独立公式'],['\\frac{a}{b}','分数'],['\\sqrt[n]{x}','n 次根'],['\\sum_{i=1}^{n} i','求和'],['\\int_a^b f(x)\\,dx','定积分'],['\\alpha \\beta \\Gamma \\pi','希腊字母'],['\\leq \\geq \\neq \\approx','常用关系符'],['\\begin{align} a&=b \\\\ c&=d \\end{align}','多行对齐（需 amsmath）']]}
 ]},
 {id:'bash',label:'Bash',description:'变量、管道、条件与脚本',source:'https://www.gnu.org/software/bash/manual/bash.html',sections:[
  {name:'变量与展开',rows:[['name=value','赋值，等号两侧不能留空格'],['echo "$name"','安全引用变量'],['${name:-default}','变量为空或未设置时使用默认值'],['${#name}','字符串长度'],['${name#prefix}','删除最短匹配的前缀'],['${name%suffix}','删除最短匹配的后缀'],['$(command)','命令替换'],['$((a + b))','算术展开']]},
  {name:'流程',rows:[['if [[ -f file ]]; then … fi','检查普通文件'],['if [[ -d dir ]]; then … fi','检查目录'],['for x in "${items[@]}"; do …; done','遍历数组'],['while IFS= read -r line; do …; done < file','逐行读取'],['case "$x" in pattern) … ;; esac','模式分支'],['function_name() { …; }','定义函数'],['set -euo pipefail','常见严格模式组合']]},
  {name:'重定向与任务',rows:[['command > file','覆盖标准输出'],['command >> file','追加标准输出'],['command 2> error.log','重定向错误输出'],['command 2>&1 | tee log','合并输出并同时写日志'],['command1 | command2','管道连接'],['command &','后台运行'],['jobs / fg / bg','查看及控制作业'],['trap "cleanup" EXIT','退出时执行清理']]}
 ]},
 {id:'linux',label:'Linux',description:'文件、进程、网络与系统信息',source:'https://man7.org/linux/man-pages/',sections:[
  {name:'文件与目录',rows:[['pwd','显示当前目录'],['ls -lah','列出含隐藏文件的详细信息'],['find . -type f -name "*.log"','按名称查找文件'],['grep -RIn "pattern" .','递归搜索文本'],['du -sh <path>','查看目录占用'],['df -h','查看文件系统空间'],['stat <path>','查看文件元数据'],['chmod u+x <file>','给所有者添加执行权限'],['ln -s <target> <link>','创建符号链接']]},
  {name:'进程与资源',rows:[['ps aux','列出进程'],['pgrep -af <name>','按名称查找进程'],['kill -TERM <pid>','请求进程正常结束'],['top','实时查看进程资源'],['free -h','查看内存用量'],['uname -a','查看内核与系统信息'],['journalctl -u <service> -f','跟踪服务日志（systemd）']]},
  {name:'网络与归档',rows:[['ip addr','查看网络地址'],['ss -tulpen','查看监听端口'],['curl -I <url>','仅取 HTTP 响应头'],['ssh user@host','连接远程主机'],['scp file user@host:/path/','复制文件到远程主机'],['tar -czf out.tar.gz <dir>','创建 gzip 归档'],['tar -xzf out.tar.gz','解压 gzip 归档']]}
 ]},
 {id:'regex',label:'Regex',description:'以 JavaScript 正则表达式语法为准',source:'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions/Cheatsheet',sections:[
  {name:'字符与边界',rows:[['.','除换行符外的任意字符（s 标志可改变）'],['\\d / \\D','数字 / 非数字'],['\\w / \\W','单词字符 / 非单词字符'],['\\s / \\S','空白 / 非空白'],['[abc] / [^abc]','字符集合 / 排除集合'],['[a-z]','字符范围'],['^ / $','输入开头 / 结尾'],['\\b / \\B','单词边界 / 非单词边界']]},
  {name:'重复与分组',rows:[['* / + / ?','零次以上 / 一次以上 / 可选'],['{n} / {n,m}','固定次数 / 次数范围'],['*? / +? / {n,m}?','非贪婪量词'],['(abc)','捕获分组'],['(?:abc)','非捕获分组'],['(?<name>abc)','命名捕获分组'],['\\1 / \\k<name>','数字 / 命名反向引用'],['a|b','或']]},
  {name:'断言与标志',rows:[['(?=abc) / (?!abc)','正向 / 负向先行断言'],['(?<=abc) / (?<!abc)','正向 / 负向后行断言'],['/pattern/g','全局匹配'],['/pattern/i','忽略大小写'],['/pattern/m','多行模式'],['/pattern/s','点号匹配换行'],['/pattern/u','Unicode 模式']]}
 ]}
];
