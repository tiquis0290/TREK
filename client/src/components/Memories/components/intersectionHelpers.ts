export function getScrollableParent(node: HTMLElement | null): HTMLElement | null {
    while (node) {
        const style = window.getComputedStyle(node)
        const overflowY = style.overflowY
        if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
            return node
        }
        node = node.parentElement
    }
    return null
}

export function observeIntersection(
    element: Element | null,
    callback: (visible: boolean) => void,
    rootMargin?: string
): () => void {
    if (!element || typeof IntersectionObserver === 'undefined') {
        callback(true)
        return () => {}
    }

    const scrollParent = getScrollableParent(element instanceof HTMLElement ? element : element.parentElement)
    const root = scrollParent || null
    const rootHeight = window.innerHeight
    const actualRootMargin = rootMargin !== undefined ? rootMargin : (root ? `${rootHeight}px` : '0px')

    const observer = new IntersectionObserver(
        entries => {
            const visible = entries.some(entry => entry.isIntersecting || entry.intersectionRatio > 0)
            callback(visible)
        },
        { root, rootMargin: actualRootMargin }
    )

    observer.observe(element)

    return () => {
        observer.disconnect()
    }
}
