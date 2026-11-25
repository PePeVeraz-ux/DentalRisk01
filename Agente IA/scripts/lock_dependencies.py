"""Pin installed direct dependencies and their runtime closure for Python 3.12."""
from importlib.metadata import distribution, version
from pathlib import Path
from packaging.requirements import Requirement
from packaging.markers import default_environment

direct=['fastapi','sqlmodel','PyJWT','argon2-cffi','boto3','pydantic-settings',
        'python-multipart','email-validator','pillow','psycopg[binary]','uvicorn','alembic','starlette','httpx']
seen={}


def include(spec):
    req=Requirement(spec)
    key=req.name.lower().replace('_','-')
    if key in seen: return
    dist=distribution(req.name)
    seen[key]=f'{dist.metadata["Name"]}=={dist.version}'
    for child in dist.requires or []:
        dep=Requirement(child)
        environments=[]
        for platform in ('win32','linux'):
            for extra in req.extras or {''}:
                env=default_environment()
                env.update(sys_platform=platform,extra=extra)
                environments.append(env)
        if dep.marker is None or any(dep.marker.evaluate(env) for env in environments):
            include(str(dep))


for spec in direct: include(spec)
Path('requirements.txt').write_text('\n'.join(f'{Requirement(s).name}'+
    ('[binary]' if Requirement(s).name=='psycopg' else '')+'=='+version(Requirement(s).name)
    for s in direct)+'\n',encoding='utf-8')
Path('requirements.lock.txt').write_text('# Python 3.12 runtime dependencies, verified in v01\n'+
    '\n'.join(seen[k] for k in sorted(seen))+'\n',encoding='utf-8')
Path('requirements-dev.txt').write_text('-r requirements.lock.txt\n'+
    '\n'.join(f'{name}=={version(name)}' for name in ['pytest','httpx','pip-audit'])+'\n',encoding='utf-8')
print(f'Pinned {len(seen)} runtime dependencies')
