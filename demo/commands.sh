
function destroyall {
    adapt deploy:list -q | xargs -r -n1 adapt deploy:destroy
}

