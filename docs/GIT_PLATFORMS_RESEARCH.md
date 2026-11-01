# Git platforms research

1 November 2026. This report looks at which Git hosting platforms Spectrum 2.0.4 could support besides GitHub, whether repository size is the real constraint and how a design with several accounts and several remotes per project would fit the existing code. Nothing in it has been built.

## 1. Summary and recommendation

**Size is probably not the constraint it seems.** GitHub blocks single files over 100 MiB and asks that a repository stay under 1 GB, and strongly under 5 GB, but it sets no small hard cap on a repository and puts no total cap on an account's Git storage ([large files](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github), [repository limits](https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits)). Spectrum already leaves each document's compiled PDF out of every commit (`compiledPdfs` and `writeExcludes` in `gitService.js`). Gitee, the platform the user heard offers more, offers much less: 500 MB per repository, 50 MB per file and 5 GB per account, with Git LFS only for paid enterprises ([Gitee quotas](https://help.gitee.com/questions/Gitee%E4%BA%A7%E5%93%81%E9%85%8D%E9%A2%9D%E8%AF%B4%E6%98%8E), [Gitee LFS](https://help.gitee.com/repository/extend/git-lfs)). Bitbucket's free plan now has 1 GB for a whole workspace. Only Tencent CNB (100 GiB free), Azure Repos (250 GB), GitLab.com (10 GiB per project, hard), Alibaba Cloud Codeup (5 GB per repository plus 5 GB of LFS) and Hugging Face (100 GB private, but unsuited) offer clearly more room than GitHub for one repository.

**Recommendation.**

1. First measure. Show each linked project's size on GitHub and its largest files in the GitHub tab, and finish the backlog item that stops tracking compiled PDFs already in a repository. This settles whether a project is near any limit at all (3 to 5 days).
2. Refactor the GitHub code behind a small host interface, with several accounts and a list of remotes per project, keeping GitHub as the only full provider (2 to 3 weeks).
3. Add **push mirrors to any HTTPS Git URL with a token**. This gives the user's "GitHub plus Gitee" case, and also Codeup, CNB, Gitea, Forgejo, Azure Repos and CodeCommit, without a bespoke integration for each (1 to 1.5 weeks).
4. Then add **Gitea and Forgejo** (including Codeberg and a self-hosted server) as a full provider, which is easy because their API is close to GitHub's, and **GitLab.com**, which has the device flow and a hard 10 GiB per project (3 to 5 days and 1 to 1.5 weeks).
5. Treat Gitee and Codeup as mirror targets only until the user has confirmed that sign-up works from Australia or Taiwan and that their rules suit LaTeX projects. Do not add Bitbucket, Codeberg for private work, SourceHut or Hugging Face.

A project keeps one **primary** remote that it pulls from and merges with, as today, and any number of **mirrors** that it only pushes to. This keeps `mergeRules.js` and `mergeOrigin` working on two sides as they do now, and it leaves Spectrum Lite's GitHub REST design unchanged as long as Lite syncs with the primary only.

## 2. Method and conventions

- Facts carry a link to the official page they come from. Statements marked **(inference)** are my reading, and statements marked **(unclear)** are where sources disagree or could not be checked.
- No account was created or signed in to, and no authenticated API was called. Only public documentation, public pricing pages and two public API descriptions (Gitee's Swagger file, version 5.4.93; Gitea's Swagger file, version 29.0.0+dev) were fetched.
- Gitee's sign-up page answered with a bot-protection script, so its phone and country options could not be inspected.
- Every host answered over HTTPS from the user's Mac. The timings went through a local proxy (TCP connects of under 10 ms to every host), so they say nothing about speed from Australia or Taiwan and are not reported.
- The code facts come from reading `apps/backend/src/services/gitService.js`, `githubService.js`, `mergeRules.js`, `settingsRepoService.js`, `apps/backend/src/routes/github.js`, `apps/backend/src/config/constants.js` and the GitHub parts of `apps/frontend/src`.

## 3. How Spectrum syncs today

### 3.1 Sign-in and tokens

- Two ways in: GitHub's OAuth device flow with Spectrum's own OAuth app (`GITHUB_CLIENT_ID` in `constants.js`, scopes `repo read:user`, no client secret), or a pasted classic or fine-grained personal access token (`startDeviceSignIn`, `pollDevice` and `signInWithToken` in `githubService.js`).
- One account only. The token, the user (`login`, `id`, `name`) and the settings repository switch live in `DATA_DIR/github.json`, written with mode 0600 (`writeAuth`). The token never reaches the window: `authStatus` returns only the login and name.
- Commits are authored as `<id>+<login>@users.noreply.github.com` (`authorOf`).

### 3.2 How Git runs

- Git runs **in process through isomorphic-git 1.43.3**, not the system `git`, so there is no credential helper. The token goes in an `Authorization: Basic` header built from `x-access-token:<token>` (`authOf` in `gitService.js`), so it is never written to `.git/config`.
- isomorphic-git has **no SSH**, which is why an SSH origin is refused (`originRepo` in `githubService.js`, and the backlog's "SSH remotes" item). It also has **no Git LFS**, and `refusal` refuses any repository whose `.gitattributes` has a `filter=` line.
- Only the remote named `origin` is used: `setRemote`, `fetchOrigin`, `pushOrigin`, `remoteHead`, `aheadBehind`, `mergeSides` and `mergeOrigin` all read or write `refs/remotes/origin/<branch>`.
- Spectrum merges itself. `mergeOrigin` plans the merge file by file with `planMerge` and the rules in `mergeRules.js` (`decide`, `mergeText`, `mergeBibFiles`, `mergeMeta`, chat and research merges, `conflictCopyPath`, `deletionBrake`, `keepBefore`), writes each file only while it still holds what was committed, then moves the branch.
- Ahead and behind are counted locally from the fetched refs, 200 commits back (`aheadBehind`). No API call is involved.

### 3.3 GitHub REST calls

| Call | Where | Purpose |
| --- | --- | --- |
| `GET /user` | `signInWithToken` | Check a token and read the login and id |
| `POST /user/repos` with `private: true` | `createRepo`, `privateRepo` | Make a project's repository, and `spectrum-settings` |
| `GET /repos/{owner}/{repo}` | `repoShared`, `link`, `privateRepo` | Private or public, and the repository's id after a rename |
| `GET /repos/{owner}/{repo}/collaborators?per_page=2` | `repoShared` | Whether anyone else has access, to hold back chats, to-dos, notes and research |
| `GET /user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator` | `listRepoProjects` | The GitHub view's list, cached by `pushed_at` |
| `GET /repos/{owner}/{repo}/contents/{path}` | `repoFile` | Read `.spectrum/settings.json` and `.spectrum/project.json` without cloning |
| `POST /login/device/code`, `POST /login/oauth/access_token` | device flow | Sign-in |

There is no GraphQL, no repository deletion and no branch API. The default branch is whatever the local repository has (`branchOf`, falling back to `main`).

### 3.4 What is GitHub-specific and what is plain Git

| GitHub-specific | Plain Git, works with any HTTPS host |
| --- | --- |
| `GITHUB_API`, `GITHUB_WEB`, `GITHUB_CLIENT_ID` in `constants.js` | `commitAll`, `writeExcludes`, `keptOut`, `compiledPdfs` |
| `api`, the device flow, `signInWithToken`, `authorOf`'s noreply address | `fetchOrigin`, `pushOrigin`, `cloneInto` (given a URL and a header) |
| `repoUrl` and the `originRepo` pattern, which accept only `GITHUB_WEB/owner/repo` | `mergeOrigin`, `planMerge`, `writeDecisions`, `mergeRules.js` |
| `createRepo`, `repoShared`, `listRepoProjects`, `repoFile`, `getFromGitHub`'s metadata read | `aheadBehind`, `treeFiles`, `commitTime` |
| `MAX_FILE_BYTES` (GitHub's 100 MiB) and its notice | `refusal` (LFS, submodules, worktrees, mid-merge) |
| The `x-access-token` user name in `authOf` | |
| `OWN_COPY = 'GitHub’s conflicted copy'` in `keptOut`, and `conflictCopyPath(f.rel, 'GitHub')` in `planMerge` | |
| The link `{ owner, repo, projectId, personal }` under `github` in `.spectrum/settings.json`, and `NAME` (one owner, one repository) | |
| `settingsRepoService.js` (the private `spectrum-settings` repository) | |
| Frontend: `GitHubSettings.tsx`, `GitHubView.tsx`, `editor/tools/GitHubTab.tsx`, `app/github.ts`, the GitHub view in `ProjectPage.tsx`, the routes in `api/client.ts` and the GitHub token pattern in `editor/preflight/run.ts` | |

The split is favourable: the hard part (committing, merging, writing files safely) is already host-neutral. What is GitHub-specific is the account, the REST calls and the naming.

## 4. Is size really the problem?

### 4.1 GitHub's actual limits

| Limit | Value | Kind |
| --- | --- | --- |
| Single file | Warning at 50 MiB, blocked at 100 MiB; 25 MiB through the browser | Hard at 100 MiB ([large files](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)) |
| Repository | "Ideally less than 1 GB, and less than 5 GB is strongly recommended" | Recommendation ([large files](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)) |
| Repository on disk | 10 GB, measured as the `.git` folder | Listed limit ([repository limits](https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits)) |
| One push | 2 GB | Hard ([repository limits](https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits)) |
| Repositories per account | 100,000; unlimited private repositories on Free | ([repository limits](https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits), [pricing](https://github.com/pricing)) |
| Git LFS on Free and Pro | 10 GiB of storage and 10 GiB of bandwidth a month; files up to 2 GB | ([LFS billing](https://docs.github.com/en/billing/concepts/product-billing/git-lfs), [about LFS](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-git-large-file-storage)) |
| LFS beyond the quota | $0.07 per GiB-month of storage and $0.0875 per GiB of bandwidth | **(unclear)**: GitHub's billing pages give these metered rates, while the [pricing page](https://github.com/pricing) still lists "$5 per month for 50GB" |

GitHub's 1 GB figure is advice, not a block. GitHub reserves the right to contact the owner of a repository that strains its infrastructure, but there is no published read-only state at 1 GB or 5 GB as there is on GitLab and Bitbucket. An older GitHub page still says LFS includes 1 GiB, which may be where the impression of little space comes from **(inference)**.

### 4.2 What Spectrum commits

- **Compiled PDFs stay out.** `compiledPdfs` finds each document's PDF (main.tex's main.pdf, a Typst or Markdown file's PDF) and `writeExcludes` lists it in Spectrum's section of `.git/info/exclude` before every commit. A PDF that a source includes as a figure (`\includegraphics`, `\includepdf`, Typst `image()`, Markdown images) is kept in.
- **Build files stay out**: the `.gitignore` that `initRepo` writes lists TeX's auxiliary files, and `keptOut` drops temp files, sync-app conflicted copies and most of `.spectrum`.
- **Files over 100 MiB are refused** and named in the GitHub tab (`MAX_FILE_BYTES` in `commitAll`).
- **Every figure, every PDF figure and every reference PDF kept in the project is committed, and every revision of it stays in the history.** This is where size comes from. As a rough illustration **(inference)**: a thesis with 100 figures of 1 MB each, each revised five times, carries about 500 MB of history. A folder of 200 reference papers at 2 MB each adds about 400 MB. Such a project would pass GitHub's 1 GB advice, and would be refused by Gitee at 500 MB.
- Spectrum cannot see a repository's size today. GitHub's `GET /repos/{owner}/{repo}` returns `size` in KiB, so the GitHub tab could show it with no new permissions.
- If an older repository already tracks compiled PDFs, they keep growing it. The backlog already has the fix: offer, when linking, to stop tracking them.

### 4.3 The alternatives on GitHub

| Option | What it saves | Cost and risk for Spectrum |
| --- | --- | --- |
| Not committing build outputs | Already done for compiled PDFs and TeX's auxiliary files | Finish the backlog item for repositories that tracked PDFs before Spectrum (2 to 3 days) |
| Size warnings | Nothing directly, but shows the user where the space goes | Read `size` from the API and list the largest blobs in the head commit (2 to 3 days) |
| Leaving reference PDFs out | Often the largest folder in an academic project **(inference)** | A per-project "keep out of Git" folder rule, written into `writeExcludes` (2 to 3 days) |
| Git LFS for figures | Moves figure history out of the repository; 10 GiB free | isomorphic-git has no LFS ([issue 1375](https://github.com/isomorphic-git/isomorphic-git/issues/1375)). Spectrum would need its own LFS client (pointer files, the batch API, uploads before push, smudge on checkout and merge), and `refusal` would have to accept the LFS filter. Lite would need the same in Rust. About 2 to 4 weeks on the desktop **(inference)** |
| Shallow history | Saves local disk on Get from GitHub only | The server still keeps everything. `mergeOrigin` needs the merge base, so a shallow clone breaks pulls once the base is beyond the depth. Not worth it |
| Starting the history again | Removes all old revisions | Force-pushing a new root breaks every other computer's link and loses history. Only as a deliberate, rare action |
| Paying GitHub | More LFS | Pro ($4 a month) and Team do not raise Git repository limits ([pricing](https://github.com/pricing)) |

### 4.4 Honest comparison

For a typical LaTeX paper with figures, GitHub's free plan has ample room: unlimited private repositories, unlimited collaborators, a 100 MiB file limit and a soft 1 GB to 5 GB per repository. For a thesis or a figure-heavy book that keeps every revision, the soft 1 GB advice can be passed, but GitHub does not stop the push. Moving such a project to Gitee would make the problem worse. Moving it to GitLab.com would give a firm 10 GiB per project, read-only beyond it. Moving it to CNB or Codeup would give more room, at the cost of a Chinese account, real-name verification for Codeup and Chinese law. The cheapest real fix for very large figure histories on GitHub is Git LFS, which Spectrum does not support yet.

## 5. The platforms

### 5.1 Storage and plans

| Platform | Per repository | Total | Single file | Git LFS | Private repositories and people | Paid tiers |
| --- | --- | --- | --- | --- | --- | --- |
| GitHub Free | Soft 1 GB, strongly under 5 GB; 10 GB on disk | No Git cap | 100 MiB | 10 GiB storage and 10 GiB bandwidth | Unlimited repositories and collaborators | Pro $4, Team $4 a user a month ([pricing](https://github.com/pricing)) |
| GitLab.com Free | 10 GiB including LFS, read-only beyond it ([storage](https://docs.gitlab.com/user/storage_usage_quotas/)) | Per project | Push 5 GiB; no separate file cap listed ([GitLab.com](https://docs.gitlab.com/user/gitlab_com/)) | Counts in the 10 GiB | Personal namespace exempt from the 5-user cap; private groups up to 5 users; new accounts up to 3 groups ([free limits](https://docs.gitlab.com/user/free_user_limit/)) | Premium about $29 a user a month **(unclear: third-party figures; the pricing page could not be fetched)**; 500 GiB per project |
| Gitee personal | 500 MB ([quotas](https://help.gitee.com/questions/Gitee%E4%BA%A7%E5%93%81%E9%85%8D%E9%A2%9D%E8%AF%B4%E6%98%8E)); the [terms](https://gitee.com/terms) say 1 GB **(unclear)** | 5 GB | 50 MB | None (paid enterprises only, 1 GB) ([LFS](https://help.gitee.com/repository/extend/git-lfs)) | 1,000 repositories; 5 collaborators across all private repositories | Enterprise plans raise a repository to 1 GB to 3 GB and a file to 100 MB to 300 MB |
| Alibaba Cloud Codeup (basic) | Git 5 GB plus LFS 5 GB | Git 20 GiB plus LFS 20 GiB | 200 MB from the command line, 50 MB on the web ([push limits](https://help.aliyun.com/zh/yunxiao/user-guide/push-restricted-issues/)) | Yes, 5 GB per repository | Unlimited members and repositories | Advanced ¥618 a person a year, 20 GiB per repository ([product page](https://www.aliyun.com/product/yunxiao/codeup)) |
| Tencent CNB | Not stated | 100 GiB of Git and 100 GiB of objects free, each month ([pricing](https://docs.cnb.cool/zh/pricing.html)) | Not stated | Yes, counted as object storage | Repositories belong to an organisation ([first repository](https://docs.cnb.cool/zh/guide/first-repo.html)) | ¥1 a GiB a month beyond the free amounts |
| Bitbucket Cloud Free | Warning at 2 GB, hard 4 GB ([reduce size](https://support.atlassian.com/bitbucket-cloud/docs/reduce-repository-size/)) | 1 GB for the whole workspace since 28 April 2025 ([announcement](https://www.atlassian.com/blog/bitbucket/important-changes-coming-to-bitbucket-clouds-free-plan)) | 100 MB | 1 GB | Up to 5 users | Standard $3.65, Premium $8 a user a month ([pricing](https://www.atlassian.com/software/bitbucket/pricing)) |
| Codeberg | Ask first above 750 MiB of Git | Ask first above 1.5 GiB of LFS, packages and attachments ([FAQ](https://docs.codeberg.org/getting-started/faq/)) | Not stated | Yes | Private only for free software projects, about 100 MB ([terms](https://codeberg.org/codeberg/org/src/branch/main/TermsOfUse.md)) | Donation-funded, no paid tier |
| Gitea or Forgejo, self-hosted | Your disk | Your disk | Your setting | Yes | Unlimited | Free software; you run it |
| Azure Repos | Under 250 GB, under 10 GB recommended ([limits](https://learn.microsoft.com/en-us/azure/devops/repos/git/limits)) | No cap listed | Advised under 100 MB; push 5 GB | Yes, outside the 5 GB push limit | Unlimited private repositories; 5 Basic users free | $6 a user a month after 5 ([pricing](https://azure.microsoft.com/en-us/pricing/details/devops/azure-devops-services/)) |
| AWS CodeCommit | Not checked | Pay per active user | Not checked | Planned for early 2026 ([InfoQ](https://infoq.com/news/2025/12/aws-codecommit-ga)), launch not confirmed **(unclear)** | IAM users | **(unclear)**: the pricing page still said closed to new customers |
| SourceHut | Aim under about 6 GiB ([git.sr.ht](https://man.sr.ht/git.sr.ht/)) | Not stated | Not stated | No | Private repositories allowed | Payment optional during the alpha ([pricing](https://sourcehut.org/pricing/)) |
| Hugging Face | No per-repository cap | 100 GB private free ([storage limits](https://huggingface.co/docs/hub/storage-limits)) | Pushes with plain files over 10 MiB are rejected; larger files must go through LFS or Xet **(community sources, not official)** | Yes, and required | Private allowed | PRO 1 TB private; $18 a TB a month beyond |

### 5.2 Accounts, reach and policy

| Platform | Sign-up from Australia or Taiwan | Reachability outside China | Law and data | Content review and terms risk |
| --- | --- | --- | --- | --- |
| GitHub | Open | Good | United States | Low for private repositories. LFS quotas became more generous in 2025 |
| GitLab.com | Open; identity checks may ask for a phone or card **(inference)** | Good | United States | Medium: the free tier has tightened three times (5-user cap from 2023, 10 GiB enforcement, 3 groups from January 2026) |
| Gitee | Phone verification is part of registration and phone binding is required for some accounts ([account help](https://help.gitee.com/questions/%E4%B8%AA%E4%BA%BA%E8%B4%A6%E6%88%B7%E5%B8%B8%E8%A7%81%E9%97%AE%E9%A2%98)); whether a +61 or +886 number is accepted could not be checked **(unclear)** | Gitee runs acceleration nodes for networks outside mainland China, including Taiwan ([overseas access](https://help.gitee.com/questions/%E6%B5%B7%E5%A4%96%E7%94%A8%E6%88%B7%E5%A6%82%E4%BD%95%E9%80%9A%E8%BF%87%E5%8A%A0%E9%80%9F%E8%8A%82%E7%82%B9%E8%AE%BF%E9%97%AEGitee)) | PRC law, Beijing courts ([terms](https://gitee.com/terms)) | High. In May 2022 every public repository was made private pending manual review ([The Register](https://www.theregister.com/2022/05/20/gitee_code_review/)). Repositories can be blocked for size, "non-compliant files" or reports ([blocked repositories](https://help.gitee.com/questions/%E9%A1%B9%E7%9B%AE%E8%A2%AB%E5%B1%8F%E8%94%BD%E5%90%8E%E5%A6%82%E4%BD%95%E5%A4%84%E7%90%86)). The terms forbid "files unrelated to code" without permission. No evidence was found that private repositories need review |
| Codeup | An Alibaba Cloud account, then real-name verification after registration ([FAQ](https://help.aliyun.com/zh/yunxiao/support/faq-12)); overseas verification usually needs company or bank documents **(inference from a reseller article)** | Hosted in China **(inference)**; large HTTPS pushes can fail with HTTP 413, and Alibaba suggests SSH, which Spectrum lacks ([push limits](https://help.aliyun.com/zh/yunxiao/user-guide/push-restricted-issues/)) | PRC law | Medium: an enterprise product with stable paid tiers, but repeated product renaming (Codeup, Yunxiao, central and region editions) |
| Tencent CNB | WeChat sign-in is the main route **(third-party tutorial)**; an organisation is needed before a repository | Hosted in China **(inference)** | PRC law | Medium to high: launched in 2025 as Tencent's successor to CODING, with generous free quotas that may change **(inference)** |
| Bitbucket | Open | Good | United States, Atlassian | High for free users: 1 GB workspace cap in 2025, app passwords switched off on 9 June 2026 ([phase 2](https://www.atlassian.com/blog/bitbucket/bitbucket-cloud-enters-phase-2-of-app-password-deprecation)) |
| Codeberg | Open | Good | Germany, a non-profit association | Private research papers do not fit its terms |
| Self-hosted Gitea or Forgejo | You | Depends on your server | Yours | None from a provider; you carry backups and uptime |
| Azure Repos | Microsoft account | Good | United States or chosen region | Medium: Azure DevOps OAuth closed to new apps in April 2025 ([OAuth](https://learn.microsoft.com/en-us/azure/devops/integrate/get-started/authentication/azure-devops-oauth)) |
| CodeCommit | AWS account with a card | Good, Sydney region | Chosen AWS region | High: closed to new customers from July 2024 to November 2025 ([history](https://docs.aws.amazon.com/codecommit/latest/userguide/history.html)) |
| SourceHut | Open | Good | Netherlands | Push is over SSH; HTTPS is read-only ([git.sr.ht](https://man.sr.ht/git.sr.ht/)) |
| Hugging Face | Open | Good | United States and France | Storage policies favour public machine-learning artefacts |

### 5.3 Notes on each platform

**GitHub (baseline).** Primary rate limit 5,000 requests an hour, with at most 80 content-creating requests a minute and 500 an hour ([rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)). Everything Spectrum needs is already in place.

**GitLab.com.** The hard 10 GiB per project includes LFS, and a project over it becomes read-only until storage is bought ([storage](https://docs.gitlab.com/user/storage_usage_quotas/)). The free plan's API allows 5,000 authenticated requests an hour and 100 a minute, and Git over HTTPS shares the 100-a-minute limit ([rate limits](https://docs.gitlab.com/user/gitlab_com/rate_limits/)). Push mirroring is free; pull mirroring needs Premium ([push mirror](https://docs.gitlab.com/user/project/repository/mirror/push/), [pull mirror](https://docs.gitlab.com/user/project/repository/mirror/pull/)). For Spectrum's single user, the personal namespace avoids the 5-user cap.

**Gitee.** Gitee's two official sources disagree on the per-repository size: the help centre's quota page says 500 MB, the terms say 1 GB. Both say 5 GB per account. The terms' section 8 also forbids "files unrelated to code" without approval by email, which a LaTeX project's figures and PDFs could be read as. Its built-in GitHub sync feature (pull from GitHub, or push to GitHub) needs a GitHub token with the `repo` scope stored on Gitee, runs at most every 5 minutes, does not carry LFS and overwrites the target's branches. Its own page says the feature was open "for a limited time" until 31 August 2022, so its status is **(unclear)** ([sync with GitHub](https://help.gitee.com/repository/settings/sync-between-gitee-github)).

**Alibaba Cloud Codeup.** The roomiest Chinese option for a single repository on the free plan. HTTPS cloning uses a separate "HTTPS password" set in personal settings, not the login password ([credentials](https://help.aliyun.com/en/yunxiao/user-guide/personal-authentication-settings/)). The OpenAPI takes a personal access token in an `x-yunxiao-token` header and works inside an organisation id ([CreateRepository](https://help.aliyun.com/zh/yunxiao/developer-reference/createreposition-creates-a-code-base)). Codeup imports from GitHub once, and an API call can trigger a re-sync, but no scheduled pull mirror was found ([migration](https://help.aliyun.com/en/yunxiao/user-guide/code-migration-and-warehouse-synchronization/), [TriggerRepositoryMirrorSync](https://help.aliyun.com/zh/yunxiao/developer-reference/api-devops-2021-06-25-triggerrepositorymirrorsync)).

**Tencent CNB.** By far the most free space: 100 GiB of Git and 100 GiB of LFS and artefacts ([pricing](https://docs.cnb.cool/zh/pricing.html)). Git over HTTPS uses the user name `cnb` and an access token as the password ([access tokens](https://docs.cnb.cool/zh/guide/access-token.html)), and the API is at `https://api.cnb.cool` with a Bearer token and a Swagger description ([OpenAPI](https://docs.cnb.cool/zh/develops/openapi.html)). Single-file limits, private repository rules and sign-up from outside China are not documented.

**Bitbucket.** The 1 GB workspace total makes it the smallest free option. API tokens replaced app passwords; Git over HTTPS takes the Bitbucket user name or the fixed name `x-bitbucket-api-token-auth`, with `read:repository:bitbucket` and `write:repository:bitbucket` scopes ([API tokens](https://support.atlassian.com/bitbucket-cloud/docs/using-api-tokens/)).

**Codeberg.** A good home for open work, not for private papers: private content is tolerated only for free software projects, up to about 100 MB.

**Gitea and Forgejo, self-hosted.** No storage limits beyond the server's disk, LFS built in, push and pull mirrors built in and the same API as Codeberg. This is the honest answer if the user wants a lot of private space without Chinese accounts, for example on a NAS **(inference)**.

**Azure Repos.** Generous (250 GB) and free for one person, but every repository sits inside an organisation and a project, and Microsoft is steering everyone from personal access tokens to Microsoft Entra tokens ([authentication](https://learn.microsoft.com/en-us/azure/devops/repos/git/auth-overview)). Worth supporting only through the generic URL option.

**AWS CodeCommit.** Open to new customers again since 25 November 2025 ([history](https://docs.aws.amazon.com/codecommit/latest/userguide/history.html)). HTTPS uses an IAM user's generated Git credentials, and the API needs AWS Signature Version 4, so a full integration is heavy. Generic URL only.

**SourceHut.** Push goes over SSH, which isomorphic-git cannot speak, so Spectrum cannot push to it. Excluded.

**Hugging Face.** 100 GB of private storage free, but plain files over 10 MiB are rejected without LFS or Xet, which Spectrum lacks, and its terms of use are aimed at machine-learning artefacts. Excluded.

## 6. Integration effort

| Platform | Sign-in | Repository API | Git over HTTPS | LFS | JavaScript SDK | Rating |
| --- | --- | --- | --- | --- | --- | --- |
| GitHub | Device flow (done); token | `/user/repos`, `/repos/{o}/{r}`, collaborators, contents (done) | `x-access-token` and token (done) | Yes | Octokit, but Spectrum uses `fetch` | Done |
| Gitea, Forgejo, Codeberg | Personal access token with `read:user` and `write:repository` ([Forgejo scopes](https://forgejo.org/docs/latest/user/token-scope/)); OAuth only as authorisation code with PKCE, no device flow ([Gitea OAuth](https://docs.gitea.com/development/oauth2-provider)) | `/api/v1/user/repos` (list and create), `/repos/{o}/{r}`, collaborators, contents: GitHub-shaped | Any user name with the token as the password; Gitea ignores the name when the password is a token ([`basic.go`](https://github.com/go-gitea/gitea/blob/main/services/auth/basic.go)), so `x-access-token` works unchanged | Yes | Plain `fetch` | Easy |
| GitLab.com | Device authorisation grant, generally available since 17.9; PKCE; access tokens last 2 hours with refresh ([OAuth](https://docs.gitlab.com/api/oauth2/)); personal access tokens up to 365 days ([PATs](https://docs.gitlab.com/user/profile/personal_access_tokens/)). Scopes `api`, `read_user`, `write_repository` | Different shape: `/projects?owned=true`, `POST /projects` with `visibility: private`, project ids or URL-encoded paths, nested groups, `/projects/:id/repository/files/:path/raw`, `/projects/:id/members/all` | User name `oauth2` for OAuth tokens; any user name for a PAT, as GitLab does not check it | Yes, counted in the 10 GiB | `@gitbeaker/rest` exists; `fetch` is enough | Medium |
| Gitee | PAT; OAuth is authorisation code with a client secret and redirect, tokens valid about one day **(secondary source)** | API v5 is modelled on GitHub's: `/api/v5/user/repos` (list, create with `private`), `/repos/{o}/{r}`, collaborators, contents, multi-file commits; token in an `access_token` parameter (from Gitee's Swagger file) | Gitee user name and the account password or a PAT **(unclear: the help page only says "account and password")** | No (free) | `fetch` | Medium |
| Tencent CNB | Access token | Own API, Swagger at `api.cnb.cool`; organisations first | `cnb` and the token | Yes | Community Go SDK only | Medium |
| Codeup | PAT for the API; a separate HTTPS clone password for Git | Organisation-scoped OpenAPI, central and region editions, Chinese documentation | Clone user name and HTTPS password | Yes | `fetch` | Hard |
| Bitbucket | API token (OAuth consumers need a secret) | Own API 2.0, workspaces | `x-bitbucket-api-token-auth` and the token | Yes | `bitbucket` npm package | Medium, low value |
| Azure Repos | PAT; Entra OAuth for apps | Own API, organisation and project | Any non-empty user name and a PAT | Yes | `azure-devops-node-api` | Hard |
| CodeCommit | IAM Git credentials | SigV4-signed API | Generated Git user name and password | Not confirmed | AWS SDK | Hard |
| Any HTTPS Git URL | User name and token typed in | None | As typed | Not with Spectrum today | None | Easy |

Two cross-cutting points:

- **The header Spectrum already sends works widely.** `x-access-token:<token>` is accepted by GitHub, GitLab (user name ignored for a PAT), Gitea, Forgejo and Codeberg, and Azure accepts any user name. Codeup, CNB, Bitbucket and possibly Gitee need a specific user name, so the user name has to become part of each account.
- **Any host with HTTPS push works with isomorphic-git.** The transport is not the hard part; the REST API and the sign-in are. `git.push` takes a `url` directly, so a mirror needs no extra remote configuration ([push](https://isomorphic-git.org/docs/en/push)).

## 7. A design for several platforms

### 7.1 A host interface

A small interface, one module per platform family, in a new folder such as `apps/backend/src/services/gitHosts/` (not `providers.js`, which already holds the model providers). Each host module supplies:

- `id`, `label`, `web` and `api` base URLs (a self-hosted server gives its own) and the user name for Git over HTTPS;
- sign-in: whether it has a device flow, the token pattern and `verifyToken(token)` returning `{ login, id, name }` (today's `signInWithToken`);
- `noreplyEmail(account)` for `authorOf`, or the user's own address where the host has no noreply form;
- `parseUrl(url)` and `cloneUrl(ref)`, replacing `repoUrl` and the GitHub-only pattern in `originRepo`. A `ref` is the host's own path (`owner/repo`, a GitLab `group/sub/project`, a Codeup organisation id and path), which replaces the `NAME` pair;
- `createPrivateRepo(name)` (today's `createRepo`), `repoInfo(ref)` returning `{ private, defaultBranch, size, webUrl, id }`, `isShared(ref)` (today's `repoShared`), `listRepos()` (today's `listRepoProjects` first call) and `readFile(ref, path)` (today's `repoFile`);
- `limits`: `maxFileBytes` (GitHub 100 MiB, Gitee 50 MB, Codeup 200 MB) and an advisory repository size, replacing `MAX_FILE_BYTES` and its "over GitHub’s 100 MB limit" notice.

What stays common, in `gitService.js`: committing, excludes, fetching, pushing, merging and the safety checks. The changes there are mechanical: `fetchOrigin`, `pushOrigin`, `remoteHead`, `aheadBehind` and `mergeOrigin` take a remote name (default `origin`), and `authOf` takes `{ username, token }`.

A generic host, "Other Git server", implements only `cloneUrl` and the Git user name. It cannot create, list or inspect repositories, so `isShared` answers "shared" and personal files are held back until the user says otherwise, which is the safe default `personalHold` already uses on an error.

### 7.2 Several accounts and their tokens

- Replace `DATA_DIR/github.json` with `DATA_DIR/git-accounts.json`, written the same way as `writeAuth` (whole, mode 0600): `{ accounts: [{ id, host, web, login, userId, name, gitUsername, token, refreshToken?, expiresAt? }], settingsAccount }`. GitLab's two-hour OAuth tokens need the refresh token and a refresh before each task.
- An account is keyed by host and user id, so a GitHub personal account and a work account, or GitHub and Gitee, can sit side by side.
- `authStatus` becomes a list of accounts without tokens. The settings repository (`settingsRepoService.js`) stays on one chosen GitHub account (`settingsAccount`), which keeps that service unchanged apart from where it reads the token.
- The tokens stay out of the window, as now. Moving them to the macOS Keychain and the Windows Credential Manager through the Tauri side is a separate improvement; with several tokens it becomes more worthwhile **(inference)**.

### 7.3 A project's remotes: a primary and mirrors

The link in `.spectrum/settings.json` travels with the project, so it names repositories, never accounts:

```
"github":  { "owner", "repo", "projectId", "personal" }     kept, for older Spectrum, when the primary is on GitHub
"remotes": [{ "host": "github.com", "ref": "owner/repo", "role": "primary" },
            { "host": "gitee.com",  "ref": "owner/repo", "role": "mirror" }]
```

- Each computer matches a remote to one of its own accounts by host (and access). A computer with no Gitee account still syncs the primary and shows the mirror as "not signed in here", rather than failing.
- In `.git/config` the primary stays `origin`, so `linkedHere` and the user's own Git tools keep working. Each mirror gets a remote of its own (for example `spectrum-gitee`), with the URL but no token.
- `personal` stays one answer per project. A mirror that is public or shared holds back the personal files on its own, which needs a per-remote hold: the simplest rule is that the strictest remote decides what every commit carries **(inference)**.

### 7.4 Pull, merge and conflicts with several remotes

The rule that keeps `mergeRules.js` safe: **merge with one remote only**.

- **Pull and Sync** fetch and merge the primary exactly as `pullNow` and `mergeOrigin` do now. `planMerge` keeps its two sides and its base.
- **Back up** commits, pushes to the primary (with the existing rejected-push retry in `pushNow`), then pushes the same branch to each mirror. A mirror push is fast-forward only. A mirror's failure is kept as that mirror's state, retried by `startRetries` and never blocks the primary.
- **A mirror that moved on its own** (someone edited on Gitee's website) rejects the fast-forward. Spectrum then fetches it and checks whether the mirror's head is already in the local history. If not, it stops pushing to that mirror and asks: bring its changes in once (one `mergeOrigin` run against that remote, with conflicted copies named after that host) or overwrite the mirror with this computer's history.
- **The primary unreachable** (an outage, or GitHub blocked on a network) could fall back to a mirror for that sync: fetch it, merge, push to it and later fast-forward the primary from the local branch. This works because the mirror holds the same commits. It is an option for the user to choose, not part of the first version (see section 8.4).
- **Conflicted copies.** `OWN_COPY` in `gitService.js` and the label in `planMerge` must stop being "GitHub". `keptOut` lets a conflicted copy into the commit only when its name contains `GitHub’s conflicted copy`, so a copy labelled `Gitee’s conflicted copy` would silently stay out. Either keep a fixed label, or make `keptOut` accept every host label Spectrum writes, and keep accepting the old one.
- `aheadBehind` is counted per remote from `refs/remotes/<name>/<branch>`, and the GitHub tab shows the primary's counts first and each mirror's "last pushed" time.

### 7.5 Mirroring on the platform side instead

| Direction | Where it is set up | Cost and limits |
| --- | --- | --- |
| GitHub to Gitee | Gitee's "sync with GitHub" | Needs a GitHub token with the whole `repo` scope stored on Gitee, which reaches every repository of the account; no LFS; status since August 2022 unclear |
| GitHub to GitLab | GitLab pull mirror | Premium only |
| GitLab to GitHub | GitLab push mirror | Free, within five minutes of a push |
| GitHub to Codeup | One-time import, then an API call to re-sync | No schedule found |
| GitHub to Gitea or Forgejo | A pull mirror on the server (`/repos/migrate` with `mirror`) | Free on a self-hosted server |
| Gitea or Forgejo to GitHub | Push mirror (`/repos/{o}/{r}/push_mirrors`) | Free |

Platform-side mirroring needs no Spectrum code, and the user can set it up today. Its weaknesses are a broad GitHub token held by a third party, delays, no LFS on Gitee and Spectrum not knowing the mirror exists. Spectrum-side push mirrors avoid all four. Spectrum could still show "this repository is mirrored by the platform" as a note, without managing it.

### 7.6 Any Git URL with a token

The generic option is the cheapest way to cover Gitee, Codeup, CNB, Azure Repos, CodeCommit and any self-hosted server, for mirrors and also as a primary:

- The user pastes an HTTPS URL, a user name and a token. Spectrum checks them by fetching once (an empty repository answers as `fetchOrigin` already handles) and stores them as an account for that host.
- The repository must already exist; Spectrum cannot create it.
- Without an API, Spectrum treats the repository as shared and cannot list it in the GitHub view, so Get from that host needs the URL typed in.
- SSH URLs stay refused, as now.

### 7.7 Migrating projects linked to GitHub

- At the first start of the new version, `github.json` becomes the first account in `git-accounts.json`, unchanged, and the settings repository points at it. The old file stays for a downgrade.
- A project's `github` link is read as its primary remote. `remotes` is written only when a mirror or another host is added, and `github` keeps being written for a GitHub primary, so 2.0.4 on the other computer goes on syncing it and simply ignores the mirrors.
- A project whose primary is not on GitHub has no `github` key, so an older Spectrum sees it as unlinked. It would make a new GitHub repository only if the user chose Back up there, so the risk is small but real, and the release notes should say to update every computer first **(inference)**.
- Changing a project's primary (say from GitHub to GitLab) is: push the whole history to the new host, make it `origin`, keep the old one as a mirror or remove it. The history and merge bases carry over.

### 7.8 How the interface might look

- **Settings › Accounts** (now Settings › GitHub, `GitHubSettings.tsx`): a list of signed-in accounts, each with its host, login and a Sign out button, and an "Add account" menu: GitHub (device code), GitLab.com (device code), Gitea, Forgejo or Codeberg (server address and token), Gitee (token), Other Git server (URL, user name and token). The settings repository switch names the GitHub account it uses.
- **Tools › GitHub** becomes **Tools › Sync** (`GitHubTab.tsx`): the primary at the top with its ahead and behind counts and Sync, Pull and Back up as now; below it a "Mirrors" list, each with its last push, its state and a remove button; and "Add mirror", which can create the repository on a host with an API or take a URL.
- **The projects page** (`ProjectPage.tsx`): the "GitHub" view becomes "Online", grouped by account, with Get from any account that has a list API. The card badge separates a primary problem (attention) from a mirror problem (a quieter note).
- **Words**: "Pull from GitHub", "Before pull from GitHub" and the notices name the primary's host instead.

### 7.9 Effect on Spectrum Lite

`SPECTRUM_LITE_RESEARCH.md` (section 10) has Lite sync through GitHub's Git Data REST API from Rust, with no local repository: read the tree, fetch changed blobs, merge with the shared rules, write one tree and commit, then a fast-forward reference update.

- **If mirrors are a desktop feature only**, Lite does not change. Lite syncs with the primary; the next desktop backup carries Lite's commits to the mirrors.
- **A primary on another host** needs a REST transport per host in Rust. GitLab has a single "commit with actions" call (create, update, delete, move; base64 content; up to 300 MB per request and rate-limited above 20 MB) ([commits API](https://docs.gitlab.com/api/commits/)). Gitea and Forgejo have tree and blob reads and a multi-file `POST /repos/{o}/{r}/contents` (from Gitea's Swagger file). Gitee has tree and blob reads and a multi-file commit call. Each would be about 1 to 2 weeks **(inference)**, and each needs a check that its commit call refuses to move a branch that moved meanwhile, which GitHub's fast-forward reference update guarantees and the others' documentation does not state **(unclear)**.
- **A generic Git URL cannot work in Lite's design**, which has no Git client. gitoxide still has no push ([discussion 2810](https://github.com/GitoxideLabs/gitoxide/discussions/2810)), and libgit2 brings the build problems Lite's research listed.
- **LFS**, if the desktop adds it, has to be added to Lite's transport too.

The design keeps Lite's options open if the host interface's REST half (list, create, read a file) is kept separate from the Git half, so that Lite can implement the same interface in Rust for the hosts it supports.

## 8. Recommendation

### 8.1 Which platforms first, and why

1. **No new platform before measuring.** If the user's projects are under 1 GB on GitHub, which most LaTeX projects are **(inference)**, the problem is solved by showing that.
2. **Push mirrors to any HTTPS Git URL.** It answers the user's stated goal (GitHub plus Gitee), works for every host with HTTPS push, needs no API work and no new sign-in flows and does not touch the merge.
3. **Gitea and Forgejo** as a full host: easy, GitHub-shaped API, no storage limits on a self-hosted server and Codeberg for open work.
4. **GitLab.com** as a full host: the only large Western alternative with a device flow and a firm, larger per-project allowance (10 GiB) on the free plan.
5. **Gitee, Codeup and CNB** stay mirror targets through the generic URL until the user confirms sign-up works and accepts Chinese law and content rules. Gitee in particular gives less space than GitHub. CNB is the one to watch if space really matters and a Chinese account is acceptable.

### 8.2 Phases

| Phase | Work | Size |
| --- | --- | --- |
| 0 | Repository size and largest files in the GitHub tab; stop tracking compiled PDFs already in a repository (backlog); optionally a "keep out of Git" folder | 3 to 5 days |
| 1 | Host interface with GitHub as its only full host; `git-accounts.json` with several accounts and the migration from `github.json`; `remotes` in `settings.json` alongside `github`; remote names in `gitService.js`; host-neutral conflicted-copy label, words and file limit | 2 to 3 weeks |
| 2 | Push mirrors: the generic URL account, Add mirror, mirror states and retries, the moved-mirror check and its two answers, per-remote ahead and behind | 1 to 1.5 weeks |
| 3 | Gitea and Forgejo host (token sign-in, list, create, sharedness, read a file) | 3 to 5 days |
| 3 | GitLab.com host (device flow, token refresh, project ids and nested groups, members, files) | 1 to 1.5 weeks |
| 4 (optional) | Gitee host on API v5 | 4 to 6 days |
| 4 (optional) | CNB or Codeup host | About 1 week and 1 to 2 weeks |
| 5 (optional) | Git LFS for figures on the desktop, then in Lite | 2 to 4 weeks, plus Lite |

Each phase needs the usual round-trip testing between a Mac and a Windows computer, which the sizes include only loosely.

### 8.3 Risks

- **Older versions on the other computer.** They read only `github` and know nothing of mirrors or other hosts. Keeping `github` written for GitHub primaries contains this.
- **Personal files leaking to a public mirror.** A mirror must never receive what the primary holds back; with one commit pushed everywhere, the strictest remote has to decide.
- **Mirror divergence.** Someone editing on a mirror's website, or a platform-side mirror also pushing, makes Spectrum's fast-forward fail. The design stops and asks rather than force-pushing.
- **Chinese platforms' terms.** Gitee's history of mass review, its clause on files unrelated to code and its small quotas; Codeup's real-name verification; CNB's newness. Data on them is under PRC law.
- **Token sprawl.** More tokens in one 0600 file raise the case for the Keychain.
- **HTTPS-only pushes.** Codeup suggests SSH for large pushes, and Spectrum has no SSH. A first push of a large project to Codeup may fail with HTTP 413.
- **Free tiers change.** GitLab, Bitbucket and AWS all changed theirs in the last three years; Spectrum should read limits from the host where it can and keep its own copies of them advisory.

### 8.4 Questions for the user

1. Which project ran short of space, how large is it and what did GitHub actually say (a 50 MiB warning, a refused file over 100 MiB or only the 1 GB advice)? Did the impression come from GitHub's older 1 GiB LFS figure?
2. Is a mirror only a backup that Spectrum pushes to, or should Spectrum also fall back to it when GitHub cannot be reached?
3. Is Gitee still wanted, given 500 MB per repository, 50 MB per file, 5 GB in all, no free LFS and its terms on non-code files? Would CNB or Codeup suit better, and is a WeChat sign-in or Alibaba real-name verification acceptable?
4. Can the user try signing up to Gitee, Codeup and CNB from Australia and from Taiwan, since that could not be checked from here?
5. Should Spectrum invest in Git LFS for figures, knowing it also has to be built for Lite?
6. Should the tokens move to the Keychain and the Windows Credential Manager as part of the accounts work?
7. Does the settings repository stay on GitHub only?
8. Should Spectrum Lite's first version stay GitHub-only, with mirrors left to the desktop?

## 9. Sources

GitHub: [repository limits](https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits), [large files](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github), [about Git LFS](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-git-large-file-storage), [Git LFS billing](https://docs.github.com/en/billing/concepts/product-billing/git-lfs), [pricing](https://github.com/pricing), [REST rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api).

GitLab: [storage quotas](https://docs.gitlab.com/user/storage_usage_quotas/), [GitLab.com settings](https://docs.gitlab.com/user/gitlab_com/), [GitLab.com rate limits](https://docs.gitlab.com/user/gitlab_com/rate_limits/), [free tier limits](https://docs.gitlab.com/user/free_user_limit/), [pull mirroring](https://docs.gitlab.com/user/project/repository/mirror/pull/), [push mirroring](https://docs.gitlab.com/user/project/repository/mirror/push/), [OAuth 2.0](https://docs.gitlab.com/api/oauth2/), [personal access tokens](https://docs.gitlab.com/user/profile/personal_access_tokens/), [commits API](https://docs.gitlab.com/api/commits/).

Gitee: [product quotas](https://help.gitee.com/questions/Gitee%E4%BA%A7%E5%93%81%E9%85%8D%E9%A2%9D%E8%AF%B4%E6%98%8E), [usage quota](https://help.gitee.com/account/usage-quota), [Git LFS](https://help.gitee.com/repository/extend/git-lfs), [terms](https://gitee.com/terms), [sync with GitHub](https://help.gitee.com/repository/settings/sync-between-gitee-github), [overseas access](https://help.gitee.com/questions/%E6%B5%B7%E5%A4%96%E7%94%A8%E6%88%B7%E5%A6%82%E4%BD%95%E9%80%9A%E8%BF%87%E5%8A%A0%E9%80%9F%E8%8A%82%E7%82%B9%E8%AE%BF%E9%97%AEGitee), [blocked repositories](https://help.gitee.com/questions/%E9%A1%B9%E7%9B%AE%E8%A2%AB%E5%B1%8F%E8%94%BD%E5%90%8E%E5%A6%82%E4%BD%95%E5%A4%84%E7%90%86), [account questions](https://help.gitee.com/questions/%E4%B8%AA%E4%BA%BA%E8%B4%A6%E6%88%B7%E5%B8%B8%E8%A7%81%E9%97%AE%E9%A2%98), [HTTPS and SSH](https://help.gitee.com/repository/base/%E9%80%9A%E8%BF%87https%E3%80%81ssh%E5%8D%8F%E8%AE%AE%E6%8E%A8%E6%8B%89%E4%BB%A3%E7%A0%81), [API v5 Swagger](https://gitee.com/api/v5/swagger_doc.json), [The Register on the 2022 review](https://www.theregister.com/2022/05/20/gitee_code_review/), [South China Morning Post on the 2022 review](https://amp.scmp.com/tech/big-tech/article/3178323/gitee-chinas-answer-github-review-all-code-temporarily-closing-open), [a 2026 third-party summary of the quotas](https://blog.csdn.net/weixin_28835789/article/details/159071079).

Alibaba Cloud Codeup: [product and plans](https://www.aliyun.com/product/yunxiao/codeup), [push limits](https://help.aliyun.com/zh/yunxiao/user-guide/push-restricted-issues/), [FAQ](https://help.aliyun.com/zh/yunxiao/support/faq-12), [personal credentials](https://help.aliyun.com/en/yunxiao/user-guide/personal-authentication-settings/), [HTTPS password](https://help.aliyun.com/zh/yunxiao/user-guide/configure-https-clone-account-password), [CreateRepository](https://help.aliyun.com/zh/yunxiao/developer-reference/createreposition-creates-a-code-base), [migration](https://help.aliyun.com/en/yunxiao/user-guide/code-migration-and-warehouse-synchronization/), [TriggerRepositoryMirrorSync](https://help.aliyun.com/zh/yunxiao/developer-reference/api-devops-2021-06-25-triggerrepositorymirrorsync), [Git LFS](https://help.aliyun.com/zh/yunxiao/user-guide/codeup-git-lfs-feature-introduction).

Tencent CNB: [pricing](https://docs.cnb.cool/zh/pricing.html), [first repository](https://docs.cnb.cool/zh/guide/first-repo.html), [access tokens](https://docs.cnb.cool/zh/guide/access-token.html), [OpenAPI](https://docs.cnb.cool/zh/develops/openapi.html), [a Tencent Cloud community tutorial](https://cloud.tencent.com/developer/article/2735637).

Bitbucket: [free plan changes](https://www.atlassian.com/blog/bitbucket/important-changes-coming-to-bitbucket-clouds-free-plan), [pricing](https://www.atlassian.com/software/bitbucket/pricing), [reduce repository size](https://support.atlassian.com/bitbucket-cloud/docs/reduce-repository-size/), [API tokens](https://support.atlassian.com/bitbucket-cloud/docs/using-api-tokens/), [app password deprecation](https://www.atlassian.com/blog/bitbucket/bitbucket-cloud-enters-phase-2-of-app-password-deprecation).

Codeberg, Gitea and Forgejo: [Codeberg FAQ](https://docs.codeberg.org/getting-started/faq/), [Codeberg terms of use](https://codeberg.org/codeberg/org/src/branch/main/TermsOfUse.md), [Gitea OAuth2 provider](https://docs.gitea.com/development/oauth2-provider), [Gitea API usage](https://docs.gitea.com/development/api-usage), [Gitea basic authentication source](https://github.com/go-gitea/gitea/blob/main/services/auth/basic.go), [Gitea Swagger](https://gitea.com/swagger.v1.json), [Forgejo token scopes](https://forgejo.org/docs/latest/user/token-scope/).

Azure, AWS, SourceHut and Hugging Face: [Azure Repos limits](https://learn.microsoft.com/en-us/azure/devops/repos/git/limits), [Azure Repos authentication](https://learn.microsoft.com/en-us/azure/devops/repos/git/auth-overview), [Azure DevOps OAuth](https://learn.microsoft.com/en-us/azure/devops/integrate/get-started/authentication/azure-devops-oauth), [Azure DevOps pricing](https://azure.microsoft.com/en-us/pricing/details/devops/azure-devops-services/), [CodeCommit document history](https://docs.aws.amazon.com/codecommit/latest/userguide/history.html), [CodeCommit returns to general availability](https://aws.amazon.com/blogs/devops/aws-codecommit-returns-to-general-availability), [InfoQ on CodeCommit](https://infoq.com/news/2025/12/aws-codecommit-ga), [git.sr.ht](https://man.sr.ht/git.sr.ht/), [SourceHut pricing](https://sourcehut.org/pricing/), [Hugging Face storage limits](https://huggingface.co/docs/hub/storage-limits), [a write-up of Hugging Face's 10 MiB rule](https://tecadmin.net/your-push-was-rejected-because-it-contains-files-larger-than-10-mib/).

Git libraries: [isomorphic-git push](https://isomorphic-git.org/docs/en/push), [isomorphic-git LFS issue 1375](https://github.com/isomorphic-git/isomorphic-git/issues/1375), [gitoxide discussion 2810](https://github.com/GitoxideLabs/gitoxide/discussions/2810).
